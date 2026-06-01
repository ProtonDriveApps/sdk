# Proton Drive CLI

Command-line interface for **Proton Drive**. Use it to script backups, uploads, downloads, and sharing workflows against your cloud Drive, with machine-readable output for automation.

The CLI is built with [Bun](https://bun.sh) and uses the Drive SDK under the hood integrating all required dependencies (such as HTTP client, crypto library, caching, etc.).

## Requirements

- [Bun](https://bun.sh) 1.3.14 or newer (for development builds from this repository)
- A Proton account and browser access for sign-in
- A secret store provided by your OS:
    - Windows: Windows Credential Manager
    - macOS: Keychain Services
    - Linux: libsecret (e.g., GNOME Keyring, KWallet)

## Download the CLI

Download the latest release from [proton.me/download/drive/cli](https://proton.me/download/drive/cli/index.html).

## Install and build (from source)

From the `js/cli` directory:

```bash
bun install
bun run build
```

This produces a standalone executable at **`release/proton-drive`** with embedded Bun. Add that directory to your `PATH`, or invoke it with a full path.

## Authentication

Sign-in uses the browser (no password on the command line):

```bash
./release/proton-drive auth login
```

After a successful login, the CLI stores the session in the **OS secret store** (see [Where data is stored](#where-data-is-stored)). Log out with `auth logout`.

## Usage

**Interactive shell** (no arguments):

```bash
./release/proton-drive
```

**One-shot commands** (good for scripts):

```bash
./release/proton-drive filesystem list /my-files
./release/proton-drive filesystem upload ./local-folder /my-files/parent
./release/proton-drive sharing status /my-files/shared-folder
```

**Discover commands and their usage:**

```bash
./release/proton-drive help
./release/proton-drive filesystem upload --help
```

**Version:** (to verify the CLI and SDK versions)

```bash
./release/proton-drive version
```

**Automation-friendly output**: pass **`--json`** (`-j`) for structured results.

**Verbose output**: Use **`--verbose`** (`-v`) for logs directly in the console. Log level is configured separately, see [Environment variables](#environment-variables)).

## Thumbnails

On upload, the CLI generates WebP thumbnails for common image types (JPEG, PNG, GIF, BMP, TIFF, WebP) using [Bun's built-in image API](https://bun.com/docs/runtime/image) (requires Bun 1.3.14+). Use **`--skip-thumbnails`** (**`-t`**) on `filesystem upload` when you do not need previews or your system doesn't support Bun's image API.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PROTON_DRIVE_CACHE_DIR` | If set, **cache**, **app data**, and **logs** all use this single directory (portable installs, explicit data root). | Unset — OS-specific paths below |
| `PROTON_DRIVE_LOG_LEVEL` | Minimum log level written by the telemetry stack: `DEBUG`, `INFO`, `WARNING`, `ERROR`. | `DEBUG` |

## Where data is stored

Unless `PROTON_DRIVE_CACHE_DIR` is set:

| Purpose | macOS | Windows | Linux / Unix |
|---------|--------|---------|----------------|
| **Cache** (`cache-crypto.sqlite`, `cache-entities.sqlite`) | `~/Library/Caches/proton-drive-cli` | `%LOCALAPPDATA%\proton-drive-cli\Cache` | `$XDG_CACHE_HOME/proton-drive-cli` or `~/.cache/proton-drive-cli` |
| **App data** (`clientUid.json`, `config.json`, `events.json`) | `~/Library/Application Support/proton-drive-cli` | `%LOCALAPPDATA%\proton-drive-cli\Data` | `$XDG_DATA_HOME/proton-drive-cli` or `~/.local/share/proton-drive-cli` |
| **Logs** (`proton-drive.log`) | `~/Library/Logs/proton-drive-cli` | `%LOCALAPPDATA%\proton-drive-cli\Logs` | `$XDG_STATE_HOME/proton-drive-cli` or `~/.local/state/proton-drive-cli` |

**Credentials** are stored in the OS secret store (see [Requirements](#requirements)) under the service `ch.proton.drive/drive-sdk-cli`.

To reset local state for troubleshooting, stop the CLI, then remove the relevant directories (or the single override directory).
