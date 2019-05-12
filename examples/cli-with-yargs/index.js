const { install, uninstall } = require('../../src/index')
const { readFile } = require('fs-extra')
const { yamlParse } = require('yaml-cfn')
const yargs = require('yargs')
const { join } = require('path')
const toPairs = require('lodash/toPairs')
const kebabCase = require('lodash/kebabCase')

const handleError = (error, params) => {
  if (params.verbose) {
    console.error(error)
  } else {
    console.error('Error:', error.message)
  }
  process.exit(1)
}

const handleCommand = handler => async params => {
  try {
    await handler(params)
  } catch (error) {
    handleError(error, params)
  }
}

// Delve into the cloudformation template, finds parameters, and create `yargs`
// compatible options objects for the purpose of allowing template parameters
// to be overridden from the command line
const getParameterSchema = async templatePaths => {
  const templateContent = await readFile(templatePaths, 'utf8')
  const templateBody = yamlParse(templateContent)
  return toPairs(templateBody.Parameters)
    .map(([name, schema]) => {
      return {
        name,
        optionName: kebabCase(name),
        optionConfig: {
          description: schema.Description,
          default: schema.Default,
          type: 'string',
          required: !schema.Default
        }
      }
    })
}

// Middleware for incorporating the standard AWS env vars
const parseStandardAwsEnvironmentVariables = argv => {
  // Resolve from standard AWS env vars
  const awsRegion =
    argv.awsRegion || process.env.AWS_REGION
  const awsAccessKeyId =
    argv.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID
  const awsSecretAccessKey =
    argv.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
  // Copy values to expected places for the benefit of yargs and handlers
  argv.awsRegion = awsRegion
  argv.awsAccessKeyId = awsAccessKeyId
  argv.awsSecretAccessKey = awsSecretAccessKey
  // Even if not used within the app this form of the argv name is required
  // to appease yargs
  argv['aws-region'] = awsRegion
  argv['aws-access-key-id'] = awsAccessKeyId
  argv['aws-secret-access-key'] = awsSecretAccessKey
}

// Similar to `yargs` native `global: true` but allows control over ordering
// and doesn't show unless `--help` is called for a specific command.
const addStandardAppOptions = yargs =>
  yargs
    .option('aws-region', {
      description: 'AWS region',
      type: 'string',
      builder: yargs => {},
      required: true
    })
    .option('aws-access-key-id', {
      description: 'AWS access key ID',
      type: 'string',
      coerce: accessKeyId => process.env.AWS_ACCESS_KEY_ID || accessKeyId,
      required: true
    })
    .option('aws-secret-access-key', {
      description: 'AWS secret access key',
      type: 'string',
      coerce: secretAccessKey =>
        process.env.AWS_SECRET_ACCESS_KEY || secretAccessKey,
      required: true
    })
    .option('force-when-rolled-back', {
      hidden: !process.argv.includes('--show-hidden'),
      description: 'Force delete stack when rolled back',
      type: 'boolean',
      default: false
    })
    .option('verbose', {
      description: 'Show verbose output',
      type: 'boolean',
      default: false,
      alias: 'v'
    })
    .version()
    .help()

// The underlying `aws-library` takes in a logger that calls `info`, `group`,
// `groupEnd` to output a hierarchical display. Here we just add a dash before
// each message.
const logger = {
  info: (...args) => console.info('-', ...args),
  group: (...args) => console.group('-', ...args),
  // Used to mark the end of a log group visually
  groupEnd: console.groupEnd
}

const run = async () => {
  const argv = yargs
  const templatePath = join(__dirname, 'stack.yml')
  const parameterSchema = await getParameterSchema(templatePath)

  const parsedArgs = argv // eslint-disable-line
    .command({
      command: 'install',
      describe: 'Example (CLI with yargs)',
      handler: handleCommand(install({
        logger,
        templatePath,
        parameterSchema,
        stackName: 'aws-install-example-cli-with-yargs',
        brandName: 'Example (CLI with yargs)'
      })),
      builder: yargs => {
        parameterSchema.forEach(
          ({ optionName, optionConfig }) =>
            yargs.option(optionName, optionConfig)
        )
        addStandardAppOptions(yargs)
      }
    })
    .command({
      command: 'uninstall',
      describe: 'Example (CLI with yargs)',
      handler: handleCommand(uninstall({
        logger,
        stackName: 'aws-install-example-cli-with-yargs',
        brandName: 'Example (CLI with yargs)'
      })),
      builder: yargs => addStandardAppOptions(yargs)
    })
    .usage('Usage: $0 <command> [options]')
    .env('AWS_INSTALL_EXAMPLE_WITH_YARGS')
    .middleware(parseStandardAwsEnvironmentVariables, true)
    .strict()
    .argv

  // If not command is specified show help and exit
  if (!parsedArgs._[0]) {
    yargs.showHelp()
    process.exit(1)
  }
}

run()
