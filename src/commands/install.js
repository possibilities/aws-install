const fromPairs = require('lodash/fromPairs')
const toPairs = require('lodash/toPairs')
const groupBy = require('lodash/groupBy')
const walkSync = require('klaw-sync')
const { readFile } = require('fs-extra')
const { join, relative, dirname } = require('path')
const { yamlParse, yamlDump } = require('yaml-cfn')
const JSZip = require('jszip')
const getBucketNameForStack = require('../modules/getBucketNameForStack')

const confirm = require('../modules/confirm')
const sleep = require('../modules/sleep')
const waitForStack = require('../modules/waitForStack')
const showStackEvents = require('../modules/showStackEvents')
const configureShowStatus = require('../modules/configureShowStatus')
const getActiveStack = require('../modules/getActiveStack')
const createAwsClient = require('../modules/createAwsClient')

const getTemplateContents = templatePath =>
  readFile(templatePath, 'utf8')

const validateTemplate = async (templatePath, cloudFormation) => {
  const template = await getTemplateContents(templatePath)
  await cloudFormation.validateTemplate({
    TemplateBody: template
  }).promise()
}

const waitForChangeSet = async (stackName, cloudFormation) => {
  const showStatus = configureShowStatus()
  const { Summaries: [changeSet] } =
    await cloudFormation.listChangeSets({
      StackName: stackName
    }).promise()

  let isReady = false
  while (!isReady) {
    const changeSetDesc = await cloudFormation.describeChangeSet({
      ChangeSetName: changeSet.ChangeSetId
    }).promise()
    showStatus(changeSetDesc.StackStatus)
    isReady = changeSetDesc.Status.endsWith('_COMPLETE')
    if (isReady) {
      return changeSetDesc
    }
    await sleep(2000)
  }
}

const createOrUpdateChangeSet = async (
  stack,
  stackName,
  templateBody,
  bucketName,
  cloudFormation,
  parameters
) => {
  const createdChangeSet = await cloudFormation.createChangeSet({
    StackName: stackName,
    ChangeSetName: stackName + Date.now(),
    Capabilities: ['CAPABILITY_NAMED_IAM'],
    TemplateBody: templateBody,
    ChangeSetType: stack ? 'UPDATE' : 'CREATE',
    Parameters: parameters,
    Tags: [{ Key: 'bucketName', Value: bucketName }]
  }).promise()

  const changeSet = await cloudFormation.describeChangeSet({
    ChangeSetName: createdChangeSet.Id
  }).promise()

  if (changeSet.Status === 'FAILED') {
    if (changeSet.Changes.length) {
      console.error(changeSet.StatusReason)
      process.exit(1)
    } else {
      await cloudFormation.deleteChangeSet({
        ChangeSetName: createdChangeSet.Id
      }).promise()
      return
    }
  }
  return waitForChangeSet(stackName, cloudFormation)
}

const throwErrorIfRolledBack = async (stack, cloudFormation) => {
  const { Stacks: [stackDesc] } = await cloudFormation.describeStacks({
    StackName: stack.StackId
  }).promise()
  if (stackDesc.StackStatus.includes('ROLLBACK')) {
    throw new Error('An error occurred and your stack was rolled back')
  }
}

// If we have a failed install we delete the stack, wait and nullify the return
// value so that the whole thing can be recreated.
const resolveRolledBackStack = async (
  stack,
  cloudFormation,
  forceWhenRolledBack
) => {
  const { Stacks: [stackDesc] } = await cloudFormation.describeStacks({
    StackName: stack.StackId
  }).promise()
  if (stackDesc.StackStatus === 'ROLLBACK_COMPLETE') {
    const confirmed = (
      forceWhenRolledBack ||
      await confirm(
        '  - Stack is currently in rolled back state, delete before continuing?'
      )
    )
    if (confirmed) {
      await cloudFormation.deleteStack({ StackName: stack.StackId }).promise()
      await waitForStack(stack, cloudFormation)
      return null
    }
    throw new Error('Cannot install with stack in rolled back state')
  }

  return stack
}

const showChanges = (changes, logger) => {
  const changesByType = groupBy(changes.Changes, 'ResourceChange.Action')
  const actions = ['Add', 'Modify', 'Remove']
  actions.forEach(action => {
    if (!changesByType[action]) return
    logger.group(`${action} resources`)
    changesByType[action].forEach(resource => {
      const { LogicalResourceId, ResourceType } = resource.ResourceChange
      logger.info(`${LogicalResourceId} (${ResourceType})`)
    })
    logger.groupEnd()
  })
}

const getParameters = (schema, data) =>
  schema.map(paramSchema => ({
    ParameterKey: paramSchema.name,
    ParameterValue: data[paramSchema.optionName]
  }))

const ensureBucket = async (stackName, bucketName, awsRegion, s3) => {
  const existingBucket =
    await s3.headBucket({
      Bucket: bucketName
    }).promise().catch(e => undefined)

  if (!existingBucket) {
    try {
      await s3.createBucket({
        Bucket: bucketName,
        CreateBucketConfiguration: {
          LocationConstraint: awsRegion
        }
      }).promise()
      await s3.putBucketTagging({
        Bucket: bucketName,
        Tagging: {
          TagSet: [
            { Key: 'role', Value: stackName }
          ]
        }
      }).promise()
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error
      }
    }
  }

  await s3.putPublicAccessBlock({
    Bucket: bucketName,
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true
    }
  }).promise()

  await s3.waitFor('bucketExists', { Bucket: bucketName }).promise()
}

const packageLambdaCode = async (schema, bucketName, templatePath, s3) => {
  let packagedSchema = { ...schema }
  const rootPath = dirname(templatePath)
  const codePath = join(rootPath, schema.Properties.Code)

  const zip = new JSZip()

  await Promise.all(walkSync(codePath).map(async file => {
    const code = await readFile(file.path, 'utf8')
    zip.file(relative(codePath, file.path), code)
  }))

  const body = await zip.generateAsync({
    streamFiles: true,
    type: 'nodebuffer'
  })

  const bucketPath = relative(process.cwd(), codePath) + '.zip'

  await s3.putObject({
    Body: body,
    Bucket: bucketName,
    Key: bucketPath
  }).promise()

  packagedSchema.Properties.Code = {
    S3Key: bucketPath,
    S3Bucket: bucketName
  }
  return packagedSchema
}
const packageTemplate = async (
  stackName,
  bucketName,
  templatePath,
  awsRegion,
  s3
) => {
  const templateBody = await getTemplateContents(templatePath)
  await ensureBucket(stackName, bucketName, awsRegion, s3)
  const template = yamlParse(templateBody)
  const resources = await Promise.all(
    toPairs(template.Resources)
      .map(async ([name, schema]) => {
        if (schema.Type === 'AWS::Lambda::Function' && schema.Properties.Code) {
          return [
            name,
            await packageLambdaCode(schema, bucketName, templatePath, s3)
          ]
        }
        return [name, schema]
      })
  )

  return yamlDump({
    ...template,
    Resources: fromPairs(resources)
  })
}

const noopLogger = () => ({
  info: () => undefined,
  group: () => undefined,
  groupEnd: () => undefined
})

module.exports = ({
  stackName,
  brandName,
  templatePath,
  parameterSchema,
  logger = noopLogger
}) => async ({
  awsRegion,
  awsAccessKeyId,
  awsSecretAccessKey,
  forceWhenRolledBack,
  ...templateParameterArgs
}) => {
  brandName
    ? logger.group(`Install ${brandName}`)
    : logger.group(`Install ${stackName}`)

  const { s3, cloudFormation } = createAwsClient({
    region: awsRegion,
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey
  })

  await validateTemplate(templatePath, cloudFormation)

  let stack = await getActiveStack(stackName, cloudFormation)
  if (stack) {
    stack = await resolveRolledBackStack(
      stack,
      cloudFormation,
      forceWhenRolledBack
    )
  }

  if (stack) {
    logger.group('Wait for running tasks')
    await waitForStack(stack, logger, cloudFormation)
    logger.groupEnd()
  }

  logger.info(
    stack
      ? 'Update change set'
      : 'Create change set'
  )

  logger.info('Process template assets')
  const parameters = getParameters(parameterSchema, templateParameterArgs)
  const bucketName = await getBucketNameForStack(stackName, stack)
  const templateBody = await packageTemplate(
    stackName,
    bucketName,
    templatePath,
    awsRegion,
    s3
  )

  logger.group('Wait for change set')
  const changeSet = await createOrUpdateChangeSet(
    stack,
    stackName,
    templateBody,
    bucketName,
    cloudFormation,
    parameters
  )
  // Get the active stack now that we've potentially created a new one
  stack = await getActiveStack(stackName, cloudFormation)

  if (!changeSet) {
    logger.info('No changes found')
    return
  }
  logger.groupEnd()

  logger.group('Execute change set')
  showChanges(changeSet, logger)
  logger.groupEnd()

  const showingEvents =
    showStackEvents(stack, stackName, logger, cloudFormation)

  await cloudFormation.executeChangeSet({
    ChangeSetName: changeSet.ChangeSetId
  }).promise()

  logger.group('Wait for stack ready')
  await waitForStack(stack, logger, cloudFormation)
  logger.groupEnd()

  showingEvents.destroy()
  await throwErrorIfRolledBack(stack, cloudFormation)
  logger.info('Install complete')
  logger.groupEnd()
}
