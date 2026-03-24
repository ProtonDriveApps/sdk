//go:build integration

package protondrive

import (
	"context"
	"errors"
	"testing"
)

type integrationTestContext struct {
	Config IntegrationConfig
	Client *Client
}

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
	if testContext.Client != nil {
		return testContext.Client
	}
	client, err := NewClient(context.Background(), NewDialer(), testContext.Config.LoginOptions(), SessionHooks{})
	if err != nil {
		t.Fatalf("create integration client: %v", err)
	}
	testContext.Client = client
	return client
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
