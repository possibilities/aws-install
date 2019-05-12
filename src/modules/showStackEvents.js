const upperFirst = require('lodash/upperFirst')
const sleep = require('./sleep')
const getActiveStack = require('./getActiveStack')
const maxBy = require('lodash/maxBy')

const getLastTimestamp = async (stack, cloudFormation) => {
  const stackEvents = await cloudFormation.describeStackEvents({
    StackName: stack.StackId
  }).promise()
  const { StackEvents: events } = stackEvents
  const lastEvent = maxBy(events, 'Timestamp')
  return lastEvent && lastEvent.Timestamp
}

const showStackEvents = (stack, stackName, logger, cloudFormation) => {
  let isDone = false
  const showing = new Promise(async resolve => {
    let lastTimestamp = await getLastTimestamp(stack, cloudFormation)
    while (true) {
      if (isDone) break
      const stack = await getActiveStack(stackName, cloudFormation)
      if (!stack) break
      const { StackEvents: events } = await cloudFormation.describeStackEvents({
        StackName: stack.StackId
      }).promise()
      events
        .reverse()
        .filter(e => !lastTimestamp || e.Timestamp > lastTimestamp)
        .forEach(event => {
          if (event.StackName === event.LogicalResourceId) {
            logger.info(
              `${upperFirst(
                event.ResourceStatus.toLowerCase().replace(/_/g, ' ')
              )}: Stack (${stackName})`
            )
            return
          }
          logger.group(`${upperFirst(
            event.ResourceStatus.toLowerCase()
              .replace(/_/g, ' ')
          )}: ${event.LogicalResourceId} (${event.ResourceType})`)
          if (event.ResourceStatusReason) {
            logger.info(event.ResourceStatusReason.split('. (').shift())
          }
          logger.groupEnd()
        })
      lastTimestamp = await getLastTimestamp(stack, cloudFormation)
      await sleep(2000)
    }
  })

  return Object.assign(
    showing,
    { destroy: () => { isDone = true } }
  )
}

module.exports = showStackEvents
