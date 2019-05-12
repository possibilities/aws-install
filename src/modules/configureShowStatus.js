const upperFirst = require('lodash/upperFirst')

const configureShowStatus = logger => {
  let lastStatus
  return (status) => {
    if (lastStatus !== status && !status.endsWith('in progress')) {
      const label =
        upperFirst(status.toLowerCase().replace(/_/g, ' '))
      logger.info(label)
    }
    lastStatus = status
  }
}

module.exports = configureShowStatus
