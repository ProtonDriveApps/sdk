//go:build protonbridge

package protondrive

import (
	"testing"
	"time"

	bridge "github.com/rclone/Proton-API-Bridge"
	bridgecommon "github.com/rclone/Proton-API-Bridge/common"
	proton "github.com/rclone/go-proton-api"
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

func TestRevisionAttrsFromRevisionCommonNormalizesDigestsAndTime(t *testing.T) {
	attrs := revisionAttrsFromRevisionCommon(&proton.RevisionXAttrCommon{
		ModificationTime: "2026-03-23T20:55:01+0000",
		Size:             33,
		BlockSizes:       []int64{10, 23},
		Digests: map[string]string{
			"sha1": "ABCD",
		},
	})

	if attrs.Digests["SHA1"] != "abcd" {
		t.Fatalf("expected normalized digest, got %q", attrs.Digests["SHA1"])
	}
	if attrs.ModTime.IsZero() {
		t.Fatal("expected modification time to be parsed")
	}
}

func TestNodeFromLinkMapsFolderType(t *testing.T) {
	node := nodeFromLink(&proton.Link{
		LinkID:       "folder-1",
		ParentLinkID: "parent-1",
		Type:         proton.LinkTypeFolder,
		MIMEType:     "Folder",
		ModifyTime:   100,
		CreateTime:   50,
	}, "Documents")

	if node.Type != NodeTypeFolder {
		t.Fatalf("expected folder node type, got %q", node.Type)
	}
	if node.Name != "Documents" || node.ID != "folder-1" || node.ParentID != "parent-1" {
		t.Fatalf("unexpected mapped node: %#v", node)
	}
}

func TestSessionFromAuthPreservesSaltedKeyPass(t *testing.T) {
	session := sessionFromAuth(proton.Auth{
		UID:          "uid",
		AccessToken:  "access",
		RefreshToken: "refresh",
	}, "salted")

	if session.SaltedKeyPass != "salted" {
		t.Fatalf("expected salted key pass to be preserved, got %q", session.SaltedKeyPass)
	}
}

func TestSessionFromCredentialHandlesNil(t *testing.T) {
	if got := sessionFromCredential(nil); got.Valid() {
		t.Fatalf("expected empty session, got %#v", got)
	}

	got := sessionFromCredential(&bridgecommon.ReusableCredentialData{
		UID:           "uid",
		AccessToken:   "access",
		RefreshToken:  "refresh",
		SaltedKeyPass: "salted",
	})
	if !got.Valid() {
		t.Fatalf("expected valid session, got %#v", got)
	}
}

func TestFallbackMIMEType(t *testing.T) {
	if got := fallbackMIMEType(""); got != "application/octet-stream" {
		t.Fatalf("unexpected fallback MIME type %q", got)
	}
	if got := fallbackMIMEType("text/plain"); got != "text/plain" {
		t.Fatalf("expected provided MIME type, got %q", got)
	}
}

func TestRevisionAttrsFromBridgeCopiesBlockSizes(t *testing.T) {
	input := []int64{1, 2, 3}
	attrs := revisionAttrsFromBridge(&bridge.FileSystemAttrs{
		ModificationTime: time.Unix(10, 0),
		Size:             6,
		BlockSizes:       input,
		Digests:          "abcd",
	}, 9)
	input[0] = 99

	if attrs.BlockSizes[0] != 1 {
		t.Fatalf("expected block sizes to be copied, got %#v", attrs.BlockSizes)
	}
	if attrs.ModTime.Unix() != 10 {
		t.Fatalf("expected modtime to be preserved, got %v", attrs.ModTime)
	}
}
