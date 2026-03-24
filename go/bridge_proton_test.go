//go:build protonbridge

package protondrive

import (
	"testing"

	bridge "github.com/rclone/Proton-API-Bridge"
)

func TestRevisionAttrsFromBridgeNormalizesSHA1(t *testing.T) {
	attrs := revisionAttrsFromBridge(&bridge.FileSystemAttrs{
		Size:       12,
		BlockSizes: []int64{4, 8},
		Digests:    "ABCDEF",
	}, 20)

	if attrs.Digests["SHA1"] != "abcdef" {
		t.Fatalf("expected lowercase SHA1, got %q", attrs.Digests["SHA1"])
	}
	if attrs.EncryptedSize != 20 {
		t.Fatalf("expected encrypted size 20, got %d", attrs.EncryptedSize)
	}
}
