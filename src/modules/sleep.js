const sleep = waitMs =>
  new Promise(resolve => setTimeout(resolve, waitMs))

module.exports = sleep
