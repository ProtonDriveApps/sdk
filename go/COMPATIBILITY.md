# Functionality Checklist

This checklist tracks the basic Proton Drive operations currently covered by the Go package.

Legend:

- `done` implemented and live-verified through integration tests
- `partial` implemented but still has known parity gaps or narrower coverage
- `missing` not implemented yet

## Session and Auth

- `done` import/export reusable session state: `uid`, `access_token`, `refresh_token`, `salted_key_pass`
- `done` login and resume entry points in `go/client.go`
- `done` package-owned standalone dialer in `go/dialer.go`
- `done` deauth/session hooks for config persistence
- `done` real Proton login bootstrap
- `done` reusable session refresh against Proton APIs
- `missing` OTP secret based 2FA generation path

## Filesystem Operations

- `done` package API for `RootID`
- `done` package API for `ListDirectory`
- `done` package API for `SearchChild`
- `done` package API for `CreateFolder`
- `done` package API for `MoveFile`
- `done` package API for `MoveFolder`
- `done` package API for `TrashFile`
- `done` package API for `TrashFolder`
- `done` package API for `EmptyTrash`
- `done` package API for `About`
- `done` package API for `Logout`
- `done` package API for `ClearCache`
- `done` standalone driver implementation

## File Data and Metadata

- `done` package API for `GetRevisionAttrs`
- `done` package API for `DownloadFile(offset)`
- `done` package API for known-size `UploadFile`
- `done` unknown-size uploads rejected with `ErrUnknownSizeUpload`
- `partial` original-size metadata resolution
- `partial` SHA1 digest and block size retrieval
- `done` encrypted block streaming downloads
- `partial` encrypted uploads and revision commit flow

## Behavior Expectations

- `done` package surface supports the currently implemented basic Proton Drive operations
- `done` compatibility checklist committed in-tree
- `done` integration harness and credentials loader
- `partial` end-to-end parity verification for the core operation surface
- `partial` cache invalidation semantics aligned with mutations
- `done` root/share discovery parity with current expected behavior

## Integration Test Readiness

- `done` credentials file loader in `go/integration_config.go`
- `done` example credentials config in `go/integration/protondrive.test.json.example`
- `done` integration build-tag harness in `go/integration_test.go`
- `done` credential-gated integration coverage for all currently implemented operations through self-seeded fixtures and live account login
- `missing` CI strategy for gated/manual integration test execution
