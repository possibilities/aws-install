const createAwsClient = require('./modules/createAwsClient')
const getActiveStack = require('./modules/getActiveStack')
const { execSync } = require('child_process')
const request = require('axios')

const region = process.env.AWS_REGION

const runExample = async ({ exampleName, expectedOutput }) => {
  try {
    const stageName = `stage-${Date.now()}`
    execSync(
      `./examples/${exampleName}/example uninstall`,
      { stdio: 'inherit' }
    )
    execSync(
      `./examples/${exampleName}/example install --stage-name ${stageName}`,
      { stdio: 'inherit' }
    )

    const { cloudFormation } = await createAwsClient()
    const stack = await getActiveStack(
      `aws-install-example-${exampleName}`,
      cloudFormation
    )
    const restApiId = stack.Outputs
      .find(o => o.OutputKey === 'RestApiId').OutputValue
    const { data: actual } = await request(
      `https://${restApiId}.execute-api.${region}.amazonaws.com/${stageName}`
    )
    if (actual !== expectedOutput) {
      throw new Error(
        `Test failed, expected "${actual}" to equal "${expectedOutput}"`
      )
    }
    console.info(`Test output: ${actual}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

const runExamples = async () => {
  await runExample({
    exampleName: 'cli-with-yargs',
    expectedOutput: 'Hello, AWS Install! (CLI with yargs)'
  })
  await runExample({
    exampleName: 'cli-with-helper',
    expectedOutput: 'Hello, AWS Install! (CLI with helper)'
  })
}

runExamples()
