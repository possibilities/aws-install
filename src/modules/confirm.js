const prompt = require('prompt-promise')

const confirm = async message => {
  const line = await prompt(`${message} [yN] `)
  const cleanLine = line.trim().toLowerCase()
  const isOk = ['y', 'yes', 'true'].includes(cleanLine)
  prompt.end()
  return isOk
}

module.exports = confirm
