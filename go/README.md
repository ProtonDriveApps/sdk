# Proton Drive Go Package

This module is a narrow, pure-Go package intended to support the Proton Drive backend in `rclone`.

Current design goals:

- pure Go module with no cgo or native runtime dependencies
- stable session import/export using `uid`, `access_token`, `refresh_token`, and `salted_key_pass`
- backend-oriented API for directory listing, uploads, downloads, moves, trash, quota, and logout
- optional internal caching with explicit invalidation through `ClearCache`
- minimal public surface so the package can be maintained upstream and consumed by `rclone` easily

What is implemented now:

- the public API contracts for sessions, login/resume options, filesystem operations, and hooks
- a `Client` wrapper that centralizes validation and session/deauth hook behavior
- test doubles to make the package easy to integrate and evolve safely
- an optional transitional `BridgeDialer` implementation behind the `protonbridge` build tag that adapts the current `github.com/rclone/Proton-API-Bridge` package to this narrower API

What is intentionally not implemented yet:

- a native implementation that replaces `Proton-API-Bridge`
- dependency reduction work to peel the package off bridge-era mail and crypto transitive dependencies
- cache implementation owned directly by this package instead of the transitional bridge backend

Planned implementation order:

1. validate rclone compatibility using the transitional bridge-backed dialer
2. move login/session bootstrap behind package-owned interfaces and tests
3. replace bridge-backed operations incrementally with package-owned implementations
4. own revision attrs plus streaming offset downloads directly
5. own uploads and cache invalidation directly

The package is being shaped around the operations used today by `rclone/backend/protondrive`, so that a future rclone PR can replace `github.com/rclone/Proton-API-Bridge` with this module incrementally.

Using the transitional bridge-backed dialer:

```sh
go test -tags protonbridge ./...
```

That build tag is optional. Without it, the package stays dependency-light and `NewBridgeDialer()` returns `ErrBridgeDialerUnavailable`.
