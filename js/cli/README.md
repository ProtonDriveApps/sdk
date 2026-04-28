# Proton Drive CLI

The CLI provides dependencies for the SDK (such as HTTP client, logging, crypto module or account interface) and implements a simple interactive shell to run commands. The CLI is currently built using Bun and can be run on any platform that Bun supports.

## Installation

First, you need to install Bun.

Then you need to install CLI dependencies.

From `js/cli`:

```bash
bun install
```

Then you can build the CLI.

```bash
bun run build
```

Executable is written to the **release** folder when you run the command above.

Note: The CLI requires the sharp package for generating thumbnails during upload. The library is not bundled with the CLI as it requires a native module depending on the platform. You need to install the sharp package separately when running the CLI outside of the CLI directory. Either install it globally (`bun install -g sharp`) and provide `NODE_PATH` environment variable to the CLI executable, or install it locally by running `bun install sharp` in the directory with the CLI executable.

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
