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

- real Proton authentication, session resume, root/share discovery, and logout
- directory listing, child lookup, folder creation, file revision lookup, and offset downloads
- small-file uploads, file/folder moves, trash, and empty trash
- a package-owned standalone `Dialer` and `Driver` in `go/dialer.go` and `go/standalone_driver.go`
- integration credentials loading and live integration coverage in `go/integration_config.go` and `go/integration_test.go`
- compatibility and integration planning docs in `go/COMPATIBILITY.md` and `go/INTEGRATION.md`

What is still rough or intentionally incomplete:

- large-file uploads still need the multi-block upload path finalized
- revision metadata is functional but not yet full parity with the richer legacy xattr model
- cache semantics are intentionally lightweight and can be tightened further for long-lived clients

Bootstrap example:

```go
package main

import (
	"context"
	"log"

	protondrive "github.com/ProtonDriveApps/sdk/go"
)

func main() {
	ctx := context.Background()

	client, err := protondrive.NewClient(ctx, protondrive.NewDialer(), protondrive.LoginOptions{
		Username:   "user@proton.me",
		Password:   "secret",
		AppVersion: "external-drive-rclone@1.0.0",
	}, protondrive.SessionHooks{
		OnSession: func(session protondrive.Session) {
			log.Printf("persist reusable session: uid=%s", session.UID)
		},
	})
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		_ = client.Logout(ctx)
	}()

	rootID, err := client.RootID(ctx)
	if err != nil {
		log.Fatal(err)
	}

	entries, err := client.ListDirectory(ctx, rootID)
	if err != nil {
		log.Fatal(err)
	}

	for _, entry := range entries {
		log.Printf("%s %s", entry.Node.Type, entry.Node.Name)
	}
}
```

Resume with a previously persisted session:

```go
client, err := protondrive.NewClientWithSession(ctx, protondrive.NewDialer(), protondrive.ResumeOptions{
	Session: protondrive.Session{
		UID:           savedUID,
		AccessToken:   savedAccessToken,
		RefreshToken:  savedRefreshToken,
		SaltedKeyPass: savedSaltedKeyPass,
	},
	AppVersion: "external-drive-rclone@1.0.0",
}, protondrive.SessionHooks{})
```

The package is being shaped around the operations used today by `rclone/backend/protondrive`, so that a future rclone PR can replace `Proton-API-Bridge` with this module incrementally.

See `go/COMPATIBILITY.md` for the current rclone parity checklist and `go/INTEGRATION.md` for the integration-test plan.
