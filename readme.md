# AWS Install

Tools for creating installer-like [Node.js](https://nodejs.org) apps for launching infrastructure on [AWS](https://aws.amazon.com) with [CloudFormation](https://aws.amazon.com/cloudformation)

## Usage

See app in `./example` directory.

```Shell
cd ./example
yarn install
./example install
./example uninstall
```

## API

The following functions create high-level handlers that can be used in apps. E.g. `install`/`uninstall` command in a CLI application can drive these handlers. Returned handler interfaces are documented below.

##### `install(params = {}): InstallHandler`

`params` (Object):

* `stackName` – (boolean)

  The name of the CloudFormation stack that will be created. This field is required.

* `templatePath` – (string)

  Absolute path to CloudFormation body template. This field is required.

* `parameterSchema` – (object[])

  An array of object  describing parameters that the handler should pass into the CloudFormation template as [Parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html).

  Each parameter schema must have the following keys

  * `templateName`

    The name of the parameter as it will appear in the CloudFormation template.

  * `argumentName`

    The name of the parameter as it will be passed into the handler

* `logger` – (object)

  A logger that the handler will use for displaying activity.

  The object must support the following subset of the `console` API

  * `info`

  * `group`

  * `groupBy`

##### `uninstall(params = {}): UninstallHandler`

* `stackName` – (boolean)

  The name of the CloudFormation stack that will be deleted. This field is required.

### Interfaces

##### `InstallHandler`

TODO

##### `UninstallHandler`

TODO
