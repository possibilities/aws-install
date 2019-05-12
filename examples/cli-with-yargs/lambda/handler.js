exports.handler = (event, context, callback) => callback(null, {
  statusCode: 200,
  body: JSON.stringify('Hello, AWS Install! (CLI with yargs)')
})
