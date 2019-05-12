const showStackEvents = require('../modules/showStackEvents')
const waitForStack = require('../modules/waitForStack')
const getActiveStack = require('../modules/getActiveStack')
const createAwsClient = require('../modules/createAwsClient')
const getBucketNameForStack = require('../modules/getBucketNameForStack')
const sleep = require('../modules/sleep')

const noopLogger = () => ({
  info: () => undefined,
  group: () => undefined,
  groupEnd: () => undefined
})

const deleteAssetBucket = async (stackName, stack, s3) => {
  const bucketName = await getBucketNameForStack(stackName, stack)
  const { Contents: objects } = await s3.listObjects({
    Bucket: bucketName
  }).promise().catch(() => ({}))
  if (objects) {
    await Promise.all(objects.map(async obj => {
      await s3.deleteObject({
        Key: obj.Key,
        Bucket: bucketName
      }).promise()
      await sleep(100)
    }))
    await s3.deleteBucket({ Bucket: bucketName }).promise()
  }
}

module.exports = ({
  stackName,
  brandName,
  logger = noopLogger
}) => async ({
  awsRegion,
  awsAccessKeyId,
  awsSecretAccessKey
}) => {
  brandName
    ? logger.group(`Uninstall ${brandName}`)
    : logger.group(`Uninstall ${stackName}`)

  const { s3, cloudFormation } = createAwsClient({
    region: awsRegion,
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey
  })

  logger.info('Remove system stack')
  const stack = await getActiveStack(stackName, cloudFormation)
  if (!stack) {
    logger.info('Nothing to uninstall')
    process.exit(0)
  }

  logger.info('Delete assets')
  await deleteAssetBucket(stackName, stack, s3)

  const showingEvents = showStackEvents(
    stack,
    stackName,
    logger,
    cloudFormation
  )

  await cloudFormation.deleteStack({
    StackName: stack.StackName
  }).promise()

  logger.group('Wait for uninstall')
  await waitForStack(stack, logger, cloudFormation)
  showingEvents.destroy()
  logger.groupEnd()

  logger.info('Uninstall complete')
  logger.groupEnd()
}
