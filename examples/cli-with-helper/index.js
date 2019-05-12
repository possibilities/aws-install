const { createCli } = require('../../src/index')
const { join } = require('path')

createCli({
  stackName: 'aws-install-example-cli-with-helper',
  brandName: 'Example (CLI with helper)',
  templatePath: join(__dirname, 'stack.yml')
})
