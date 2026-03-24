# Integration Test Plan

The package now includes a credentials loader and a live integration harness that exercises the currently implemented Proton-backed flows.

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

The current integration suite live-verifies:

- login and session resume
- root discovery and quota lookup
- listing, search, and folder creation when configured fixtures are discoverable
- revision lookup and downloads when configured fixtures are discoverable
- small-file uploads
- move, trash, and empty-trash flows using self-created fixtures
- logout

Known limitations:

- large-file upload coverage is not complete yet
- some read-path integration tests depend on account-specific named fixtures being discoverable from the configured root/test folder
- integration tests mutate the configured account state, so they should be run against a disposable test area/account
