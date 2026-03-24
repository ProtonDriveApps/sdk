# Integration Test Plan

The package now includes a credentials loader and a placeholder integration harness so that real Proton-backed tests can be added once credentials are available.

## Credentials File

Copy:

`go/integration/protondrive.test.json.example`

to:

`go/integration/protondrive.test.json`

and fill in the account details.

The config file is intentionally untracked and should never be committed.

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

At the moment these tests only verify config loading and harness bootstrapping. They are intended to evolve into real Proton-backed integration tests as the standalone implementation replaces the placeholders.
