const AWS = require('aws-sdk')

const createAwsClient = awsConfig => {
  const s3 = new AWS.S3(awsConfig)
  const cloudFormation = new AWS.CloudFormation(awsConfig)
  return { s3, cloudFormation }
}

module.exports = createAwsClient
