//go:build integration

package protondrive

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
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
	integrationFixtureSeq uint64
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
	seq := atomic.AddUint64(&integrationFixtureSeq, 1)
	return fmt.Sprintf("sdk-integration-%s-%03d", time.Now().UTC().Format("20060102-150405"), seq)
}

func integrationFileName() string {
	return integrationFolderName() + ".txt"
}

func createIntegrationFolderFixture(t *testing.T, testContext *integrationTestContext, client *Client) (parentID, folderID, folderName string) {
	t.Helper()
	parentID = clientSessionRootID(t, client)
	folderName = integrationFolderName()
	folderID, err := client.CreateFolder(context.Background(), parentID, folderName)
	if err != nil {
		t.Fatalf("create integration folder fixture: %v", err)
	}
	return parentID, folderID, folderName
}

func createIntegrationFileFixture(t *testing.T, testContext *integrationTestContext, client *Client) (parentID, fileID, fileName string) {
	t.Helper()
	parentID = clientSessionRootID(t, client)
	fileName = integrationFileName()
	node, _, err := client.UploadFile(
		context.Background(),
		parentID,
		fileName,
		strings.NewReader("integration-mutation-fixture"),
		UploadOptions{KnownSize: int64(len("integration-mutation-fixture")), ModTime: time.Now().UTC()},
	)
	if err != nil {
		t.Fatalf("create integration file fixture: %v", err)
	}
	return parentID, node.ID, fileName
}

func resolveIntegrationFolderID(t *testing.T, testContext *integrationTestContext, client *Client) string {
	t.Helper()
	configured := strings.TrimSpace(testContext.Config.TestFolderID)
	if configured == "" {
		return clientSessionRootID(t, client)
	}
	if looksLikeLinkID(configured) {
		return configured
	}
	if folderID := findNodeRecursivelyByName(t, client, clientSessionRootID(t, client), configured, NodeTypeFolder); folderID != "" {
		return folderID
	}
	parentID := clientSessionRootID(t, client)
	parts := strings.Split(configured, "/")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		folder, err := client.SearchChild(context.Background(), parentID, part, NodeTypeFolder)
		if err != nil {
			t.Fatalf("resolve test folder by name: %v", err)
		}
		if folder == nil {
			t.Skipf("test folder path %q not found under root", configured)
		}
		parentID = folder.ID
	}
	return parentID
}

func resolveIntegrationFileID(t *testing.T, testContext *integrationTestContext, client *Client) string {
	t.Helper()
	configured := strings.TrimSpace(testContext.Config.TestFileID)
	if configured == "" {
		t.Skip("integration config missing test_file_id")
	}
	if looksLikeLinkID(configured) {
		return configured
	}
	searchParents := make([]string, 0, 2)
	if strings.TrimSpace(testContext.Config.TestFolderID) != "" {
		if folderID := resolveIntegrationFolderIDMaybe(t, testContext, client); folderID != "" {
			searchParents = append(searchParents, folderID)
		}
	}
	rootID := clientSessionRootID(t, client)
	if len(searchParents) == 0 || searchParents[0] != rootID {
		searchParents = append(searchParents, rootID)
	}
	for _, parentID := range searchParents {
		file, err := client.SearchChild(context.Background(), parentID, configured, NodeTypeFile)
		if err != nil {
			t.Fatalf("resolve test file by name: %v", err)
		}
		if file != nil {
			return file.ID
		}
	}
	if fileID := findNodeRecursivelyByName(t, client, rootID, configured, NodeTypeFile); fileID != "" {
		return fileID
	}
	t.Fatalf("test file %q not found under configured test folder or root", configured)
	return ""
}

func resolveIntegrationFolderIDMaybe(t *testing.T, testContext *integrationTestContext, client *Client) string {
	t.Helper()
	configured := strings.TrimSpace(testContext.Config.TestFolderID)
	if configured == "" {
		return ""
	}
	if looksLikeLinkID(configured) {
		return configured
	}
	parentID := clientSessionRootID(t, client)
	parts := strings.Split(configured, "/")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		folder, err := client.SearchChild(context.Background(), parentID, part, NodeTypeFolder)
		if err != nil || folder == nil {
			return ""
		}
		parentID = folder.ID
	}
	return parentID
}

func looksLikeLinkID(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	if strings.Contains(trimmed, "/") || strings.Contains(trimmed, ".") || strings.Contains(trimmed, " ") {
		return false
	}
	return len(trimmed) >= 40 && (strings.Contains(trimmed, "=") || strings.Contains(trimmed, "_") || strings.Contains(trimmed, "-"))
}

func findNodeRecursivelyByName(t *testing.T, client *Client, rootID, target string, nodeType NodeType) string {
	t.Helper()
	seen := map[string]bool{}
	queue := []string{rootID}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if seen[current] {
			continue
		}
		seen[current] = true
		entries, err := client.ListDirectory(context.Background(), current)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.Node.Name == target && entry.Node.Type == nodeType {
				return entry.Node.ID
			}
			if entry.IsFolder {
				queue = append(queue, entry.Node.ID)
			}
		}
	}
	return ""
}
