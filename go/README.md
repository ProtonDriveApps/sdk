# Proton Drive Go Package

A narrow, pure-Go SDK for basic Proton Drive operations: login, directory
listing, file upload/download, move, trash, and logout.

## Toolchain

Go 1.26.1 to match the current official `github.com/ProtonMail/go-proton-api`
dependency line.

## Design Goals

- pure Go module with no cgo or native runtime dependencies
- stable session import/export for credential-free reconnection
- minimal public surface for upstream maintainability

## What Is Implemented

- real Proton authentication via SRP, session resume, TOTP 2FA support
- root/share discovery, storage quota (`About`), and logout
- directory listing, child search (hash-based), and folder creation
- small-file uploads (<4 MiB) and large-file uploads (>4 MiB via v2 block API)
- file download with offset support and block-level decryption
- file/folder move with re-encryption for the destination keyring
- trash, empty trash, and cache management

## Quick Start

```go
client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
    Username:   "user@proton.me",
    Password:   "secret",
    AppVersion: "my-app@1.0.0",
}, protondrive.SessionHooks{})
if err != nil {
    log.Fatal(err)
}
defer client.Logout(ctx)

rootID, _ := client.RootID(ctx)
entries, _ := client.ListDirectory(ctx, rootID)
for _, e := range entries {
    fmt.Println(e.Node.Name)
}
```

See [go/USAGE.md](USAGE.md) for complete examples covering all operations.

## Project Layout

| File | Purpose |
|------|---------|
| `client.go` | Public `Client` type — input validation and delegation |
| `types.go` | Exported types, constants, `Driver` and `Dialer` interfaces |
| `session.go` | `Session`, `SessionHooks` |
| `errors.go` | Sentinel errors |
| `dialer.go` | SRP login, session resume, account bootstrap |
| `standalone_driver.go` | Core `Driver` implementation — traversal, move, trash |
| `upload.go` | Small-file and large-file upload flows |
| `download.go` | Streaming block download with offset support |
| `crypto_helpers.go` | PGP key generation, encryption, name hashing |
| `internal_drive_api.go` | REST API types and helpers for Proton endpoints |
| `fake.go` | `FakeDialer` and `FakeDriver` test doubles |
| `integration_config.go` | Credentials loader for integration tests |

## Documentation

- [go/USAGE.md](USAGE.md) — complete operation examples
- [go/TESTING.md](TESTING.md) — unit and integration test instructions
