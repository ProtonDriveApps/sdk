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
