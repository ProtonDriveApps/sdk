//go:build integration

package protondrive

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type integrationTestContext struct {
	Config IntegrationConfig
}

var (
	integrationClientOnce sync.Once
	integrationClient     *Client
	integrationClientErr  error
)

func newIntegrationTestContext(t *testing.T) *integrationTestContext {
	t.Helper()
	config, err := LoadIntegrationConfig("")
	if err != nil {
		if errors.Is(err, ErrMissingCredentialsFile) {
			t.Skip("integration credentials file not present")
			return nil
		}
		t.Fatalf("load integration config: %v", err)
	}
	if err := config.Validate(); err != nil {
		t.Skipf("integration credentials incomplete: %v", err)
		return nil
	}
	return &integrationTestContext{Config: config}
}

func requireIntegrationTestContext(t *testing.T) *integrationTestContext {
	t.Helper()
	ctx := newIntegrationTestContext(t)
	if ctx == nil {
		t.Fatal("expected integration test context")
	}
	return ctx
}

func requireIntegrationClient(t *testing.T, testContext *integrationTestContext) *Client {
	t.Helper()
	integrationClientOnce.Do(func() {
		integrationClient, integrationClientErr = NewClient(context.Background(), NewDialer(), testContext.Config.LoginOptions(), SessionHooks{})
	})
	if integrationClientErr != nil {
		t.Fatalf("create integration client: %v", integrationClientErr)
	}
	return integrationClient
}

func integrationCoverageChecklist() map[string]string {
	return map[string]string{
		"Login":            "implemented",
		"Resume":           "implemented",
		"RootID":           "implemented",
		"ListDirectory":    "planned",
		"SearchChild":      "planned",
		"CreateFolder":     "planned",
		"GetRevisionAttrs": "planned",
		"DownloadFile":     "planned",
		"UploadFile":       "planned",
		"MoveFile":         "planned",
		"MoveFolder":       "planned",
		"TrashFile":        "planned",
		"TrashFolder":      "planned",
		"EmptyTrash":       "planned",
		"About":            "planned",
		"ClearCache":       "implemented",
		"Logout":           "implemented",
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func clientSessionRootID(t *testing.T, client *Client) string {
	t.Helper()
	rootID, err := client.RootID(context.Background())
	if err != nil {
		t.Fatalf("load root id: %v", err)
	}
	return rootID
}

func integrationFolderName() string {
	return "sdk-integration-" + time.Now().UTC().Format("20060102-150405")
}
