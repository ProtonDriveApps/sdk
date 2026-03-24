# Integration Test Plan

The package now includes a credentials loader and a placeholder integration harness so that real Proton-backed tests can be added once credentials are available.

## Credentials File

Copy:

`go/integration/protondrive.test.json.example`

to:

`go/integration/protondrive.test.json`

and fill in the account details.

The config file is intentionally untracked and should never be committed.

`test_folder_id` and `test_file_id` may be either real Proton link IDs or human-readable names:

- `test_folder_id`: a folder link ID, or a folder name located directly under the Drive root
- `test_file_id`: a file link ID, or a file name located inside the configured test folder

## Planned Integration Coverage

1. `Login` with username/password and optional mailbox password / 2FA
2. `Resume` using cached session values
3. `RootID` and initial root/share discovery
4. `ListDirectory` and `SearchChild` on a configured test folder
5. `GetRevisionAttrs` on a configured test file
6. `DownloadFile` from offset `0` and non-zero offset
7. `UploadFile` with known size into a test folder
8. `MoveFile`, `MoveFolder`, `TrashFile`, `TrashFolder`, and `EmptyTrash`
9. `Logout` and session invalidation behavior

## Execution

Run integration-only tests with:

```sh
go test -tags integration ./...
```

At the moment these tests include credential-gated coverage for every operation rclone requires. Most of them still assert `ErrNotImplemented` until the standalone Proton backend is implemented, but the test structure is now in place so real behavior can be turned on method-by-method as functionality lands.
