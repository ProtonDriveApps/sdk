# Slim CLI application for JavaScript version of Drive SDK

The app implements and integrates dependencies for the SDK, such as HTTP client, logging, crypto module or account interface with authenticating user.

The integration implements only limited capabilities to run simplest run of the SDK. For example, 2FA or other than simple username and password authentication is not supported, crypto module is copy-paste from the clients monorepo without using the web workers.

This module is intended for testing purposes mainly and is in no way recommended to use for any real users.

## Installation

First, you need to install Bun.

Then you need to install CLI dependencies.

```bash
bun install
```

## Build

To build the executable, run the following command.

```bash
bun run build
```

The executable will be located in the same directory as `proton-drive`.

## Run

First, you will need to log in.

```bash
./proton-drive auth login USER
```

Then, you can call any command, for example list nodes in _My files_ section.

```bash
./proton-drive fs list /my-files
```

Run the executable without any parameter to get help.

## Environment variables

| Name                     | Description                                                                 | Default Value               |
|--------------------------|-----------------------------------------------------------------------------|-----------------------------|
| `DRIVE_SDK_BASE_URL`     | URL for the API.                                                           | `drive-api.proton.me`       |
| `DRIVE_SDK_CACHE_DIR`    | Directory where the SQLite and other caches, or logs, are stored.          | Current working directory   |
| `DRIVE_SDK_DISABLE_CONSOLE_LOG` | Option to turn off the logging to the stdout. Logs will always be available in the `proton-drive.log`, located in `DRIVE_SDK_CACHE_DIR`. | None                        |
