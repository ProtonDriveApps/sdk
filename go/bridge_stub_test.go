//go:build !protonbridge

package protondrive

import (
	"context"
	"errors"
	"testing"
)

func TestBridgeDialerStubUnavailableWithoutBuildTag(t *testing.T) {
	_, err := NewBridgeDialer().Login(
		context.Background(),
		LoginOptions{Username: "user", Password: "pass", AppVersion: "external-drive-rclone@1.0.0"},
		SessionHooks{},
	)
	if !errors.Is(err, ErrBridgeDialerUnavailable) {
		t.Fatalf("expected ErrBridgeDialerUnavailable, got %v", err)
	}
}
