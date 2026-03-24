# Proton Drive Go Package

This module is a narrow, pure-Go package intended to support the Proton Drive backend in `rclone`.

Current toolchain target:

- Go `1.26.1` to match the current official `github.com/ProtonMail/go-proton-api` dependency line

Current design goals:

- pure Go module with no cgo or native runtime dependencies
- stable session import/export using `uid`, `access_token`, `refresh_token`, and `salted_key_pass`
- backend-oriented API for directory listing, uploads, downloads, moves, trash, quota, and logout
- optional internal caching with explicit invalidation through `ClearCache`
- minimal public surface so the package can be maintained upstream and consumed by `rclone` easily

What is implemented now:

- the public API contracts for sessions, login/resume options, filesystem operations, and hooks
- a `Client` wrapper that centralizes validation and session/deauth hook behavior
- a package-owned standalone `Dialer` and placeholder `Driver` in `go/dialer.go` and `go/standalone_driver.go`
- test doubles to make the package easy to integrate and evolve safely
- integration credentials loading and an integration test harness scaffold in `go/integration_config.go` and `go/integration_test.go`
- a compatibility checklist and integration test plan in `go/COMPATIBILITY.md` and `go/INTEGRATION.md`

What is intentionally not implemented yet:

- real Proton authentication and reusable session refresh
- real root/share discovery and encrypted metadata traversal
- encrypted uploads, downloads, and revision handling
- package-owned cache semantics aligned with rclone mutations

Planned implementation order:

1. implement real session bootstrap and session refresh against Proton APIs
2. implement root/share discovery and directory traversal
3. implement revision attrs and offset-based streaming downloads
4. implement known-size uploads and server-side mutations
5. add integration coverage with real credentials and harden cache behavior

The package is being shaped around the operations used today by `rclone/backend/protondrive`, so that a future rclone PR can replace `Proton-API-Bridge` with this module incrementally.

See `go/COMPATIBILITY.md` for the current rclone parity checklist and `go/INTEGRATION.md` for the integration-test plan.
