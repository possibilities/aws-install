const isActiveStatuses = [
  'CREATE_IN_PROGRESS',
  'CREATE_COMPLETE',
  'ROLLBACK_IN_PROGRESS',
  'DELETE_IN_PROGRESS',
  'UPDATE_IN_PROGRESS',
  'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
  'UPDATE_COMPLETE',
  'UPDATE_ROLLBACK_IN_PROGRESS',
  'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
  'UPDATE_ROLLBACK_COMPLETE',
  'ROLLBACK_COMPLETE',
  'REVIEW_IN_PROGRESS'
]

const getActiveStack = async (stackName, cloudFormation) => {
  const { StackSummaries: stacks } = await cloudFormation.listStacks({
    StackStatusFilter: isActiveStatuses
  }).promise()
  const stack = stacks
    .filter(stack => stack.StackName === stackName)
    .pop()
  if (!stack) return

  const stackDescriptions = await cloudFormation
    .describeStacks({ StackName: stack.StackId })
    .promise().catch(e => undefined)
  if (stackDescriptions) {
    return stackDescriptions.Stacks.pop()
  }
}

module.exports = getActiveStack
