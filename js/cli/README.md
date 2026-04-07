# Slim CLI application for JavaScript version of Drive SDK

The app implements and integrates dependencies for the SDK, such as HTTP client, logging, crypto module or account interface with authenticating user.

The integration implements only limited capabilities to run simplest run of the SDK. For example, 2FA or other than simple username and password authentication is not supported, crypto module is copy-paste from the clients monorepo without using the web workers.


## Installation

First, you need to install Bun.

Then you need to install CLI dependencies.

```bash
bun install
```

## Build

From `js/cli`:

```bash
bun run build
```

Artifacts are written to the **current working directory** (typically `js/cli/` when you run the commands above).

## Run

Sign in via the browser (no username/password arguments needed):

```bash
./proton-drive auth login
```

Start the interactive shell:

```bash
./proton-drive
```

Get help:

```bash
./proton-drive help
```

## Environment variables

| Name                     | Description                                                       | Default Value               |
|--------------------------|-------------------------------------------------------------------|-----------------------------|
| `PROTON_DRIVE_CACHE_DIR` | Directory where the SQLite and other caches, or logs, are stored. | Current working directory   |
