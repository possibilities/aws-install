const { ulid } = require('ulid')

const getBucketNameForStack = (stackName, stack) => {
  if (stack && stack.Tags) {
    const bucketNameTag = stack.Tags.find(t => t.Key === 'bucketName')
    if (bucketNameTag) return bucketNameTag.Value
  }
  return `${stackName}-${ulid().toLowerCase()}`
}

module.exports = getBucketNameForStack
