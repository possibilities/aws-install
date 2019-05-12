const configureShowStatus = require('./configureShowStatus')
const sleep = require('./sleep')

const waitForStack = async (stack, logger, cloudFormation) => {
  const showStatus = configureShowStatus(logger)
  let isReady = false
  while (!isReady) {
    const { Stacks: [stackDesc] } = await cloudFormation.describeStacks({
      StackName: stack.StackId
    }).promise()
    showStatus(stackDesc.StackStatus)
    isReady = stackDesc.StackStatus.endsWith('_COMPLETE')
    if (!isReady) {
      await sleep(2000)
    }
  }
}

module.exports = waitForStack
