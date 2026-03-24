# Testing

## Unit Tests

Unit tests run without credentials and validate the public API surface using
`FakeDialer` and `FakeDriver` test doubles.

```sh
go test ./...
```

28 unit tests cover: client construction, session validation, all 16 `Client`
method delegations, error paths, nil-client guards, `FakeDialer.Resume`, and
cache call counting.

## Integration Tests

Integration tests exercise the SDK against a live Proton Drive account. They
are gated behind a build tag so they are skipped during normal `go test`.

### Credentials File

Copy the example config:

```sh
cp go/integration/protondrive.test.json.example go/integration/protondrive.test.json
```

Edit the file with your test account details:

```json
{
  "base_url": "https://mail.proton.me/api",
  "username": "your-username@proton.me",
  "password": "your-password"
}
```

The config file is gitignored and should never be committed.

### Running Integration Tests

```sh
go test -tags integration ./...
```

When the credentials file is missing or incomplete, integration tests skip
gracefully with `t.Skip`.

### What Integration Tests Cover

- login with username/password and TOTP support
- session resume via persisted refresh token + salted key passphrase
- root discovery and quota lookup (`About`)
- directory listing and child search (both not-found and positive match)
- folder creation with verification via search
- file revision metadata lookup
- file download from offset 0 and non-zero offset
- small-file upload (<4 MiB) with discoverability verification
- large-file upload (>4 MiB) via v2 block/revision flow
- file and folder moves with destination verification
- file and folder trash operations
- empty trash
- cache clearing
- logout with session invalidation

### Important Notes

- Integration tests **mutate** the configured account. Use a disposable test
  account or a dedicated test area.
- Tests create uniquely-named folders and files (prefixed `sdk-integration-`).
- Large-file upload tests create a 4 MiB + 1 KiB file.

### Test Commands Summary

| Command | Purpose |
|---------|---------|
| `go test ./...` | Run unit tests only |
| `go test -tags integration ./...` | Run unit + integration tests |
| `go test -v ./...` | Verbose unit test output |
| `go test -tags integration -v -run TestIntegrationResume ./...` | Run a single integration test |
| `go vet ./...` | Static analysis |
