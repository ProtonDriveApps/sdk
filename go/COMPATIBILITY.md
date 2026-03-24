# rclone Compatibility Checklist

This checklist tracks the Go package features required to replace `Proton-API-Bridge` in `rclone/backend/protondrive`.

Legend:

- `done` implemented in the package surface and backed by tests
- `scaffolded` present in the package API or harness, but not yet implemented against Proton
- `missing` not implemented yet

## Session and Auth

- `done` import/export reusable session state: `uid`, `access_token`, `refresh_token`, `salted_key_pass`
- `done` login and resume entry points in `go/client.go`
- `scaffolded` package-owned standalone dialer in `go/dialer.go`
- `scaffolded` deauth/session hooks for config persistence
- `missing` real Proton login bootstrap
- `missing` reusable session refresh against Proton APIs
- `missing` OTP secret based 2FA generation path used by rclone

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
- `scaffolded` standalone driver placeholder implementation
- `missing` real Proton-backed directory traversal and mutation logic

## File Data and Metadata

- `done` package API for `GetRevisionAttrs`
- `done` package API for `DownloadFile(offset)`
- `done` package API for known-size `UploadFile`
- `done` unknown-size uploads rejected with `ErrUnknownSizeUpload`
- `missing` original-size metadata resolution
- `missing` SHA1 digest and block size retrieval
- `missing` encrypted block streaming downloads
- `missing` encrypted uploads and revision commit flow

## rclone Behavior Expectations

- `done` package surface supports all operations currently called by the rclone backend
- `done` compatibility checklist committed in-tree
- `scaffolded` integration harness and credentials loader
- `missing` end-to-end parity verification against a real Proton Drive account
- `missing` cache invalidation semantics aligned with rclone mutations
- `missing` root/share discovery parity with current rclone expectations

## Integration Test Readiness

- `done` credentials file loader in `go/integration_config.go`
- `done` example credentials config in `go/integration/protondrive.test.json.example`
- `done` integration build-tag harness in `go/integration_test.go`
- `missing` real integration tests once credentials are available
- `missing` CI strategy for gated/manual integration test execution
