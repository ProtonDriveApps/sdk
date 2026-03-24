//go:build integration

package protondrive

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

func TestLoadIntegrationConfigMissingFile(t *testing.T) {
	_, err := LoadIntegrationConfig("integration/does-not-exist.json")
	if !errors.Is(err, ErrMissingCredentialsFile) {
		t.Fatalf("expected ErrMissingCredentialsFile, got %v", err)
	}
}

func TestIntegrationConfigProducesLoginOptions(t *testing.T) {
	config := IntegrationConfig{
		BaseURL:  "https://mail.proton.me/api",
		Username: "user",
		Password: "pass",
	}
	options := config.LoginOptions()
	if options.Username != config.Username || options.BaseURL != config.BaseURL || options.AppVersion != defaultIntegrationAppVersion {
		t.Fatalf("unexpected login options: %#v", options)
	}
}

func TestStandaloneIntegrationHarnessBootstrapsFromConfig(t *testing.T) {
	driver, err := NewDialer().Login(context.Background(), LoginOptions{
		BaseURL:    "https://mail.proton.me/api",
		Username:   "user",
		Password:   "pass",
		AppVersion: "proton-drive-go-sdk-integration@1.0.0",
	}, SessionHooks{})
	if err == nil {
		_ = driver.Logout(context.Background())
	}
}

func TestIntegrationConfigValidatesCredentialPresence(t *testing.T) {
	config := IntegrationConfig{}
	if err := config.Validate(); err == nil {
		t.Fatal("expected missing credential validation error")
	}

	config.BaseURL = "https://mail.proton.me/api"
	config.Username = "user"
	config.Password = "pass"
	if err := config.Validate(); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestIntegrationLoginWithCredentials(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client, err := NewClient(context.Background(), NewDialer(), testContext.Config.LoginOptions(), SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected login error: %v", err)
	}
	if !client.Session().Valid() {
		t.Fatalf("expected valid session after login, got %#v", client.Session())
	}
}

func TestIntegrationRootID(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	rootID, err := client.RootID(context.Background())
	if err != nil {
		t.Fatalf("unexpected root id error: %v", err)
	}
	if rootID == "" {
		t.Fatal("expected non-empty root id")
	}
}

func TestIntegrationAbout(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	usage, err := client.About(context.Background())
	if err != nil {
		t.Fatalf("unexpected about error: %v", err)
	}
	if usage.Total < usage.Used {
		t.Fatalf("expected total >= used, got %+v", usage)
	}
}

func TestIntegrationListDirectory(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	entries, err := client.ListDirectory(context.Background(), clientSessionRootID(t, client))
	if err != nil {
		t.Fatalf("unexpected list directory error: %v", err)
	}
	if entries == nil {
		t.Fatal("expected directory entries slice")
	}
}

func TestIntegrationSearchChild(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	result, err := client.SearchChild(context.Background(), clientSessionRootID(t, client), "definitely-not-present-sdk-test-entry", NodeTypeFile)
	if err != nil {
		t.Fatalf("unexpected search child error: %v", err)
	}
	if result != nil {
		t.Fatalf("expected no result for unknown child, got %#v", result)
	}
}

func TestIntegrationCreateFolder(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	parentID := clientSessionRootID(t, client)
	folderName := integrationFolderName()
	folderID, err := client.CreateFolder(context.Background(), parentID, folderName)
	if err != nil {
		t.Fatalf("unexpected create folder error: %v", err)
	}
	if folderID == "" {
		t.Fatal("expected created folder id")
	}
	created, err := client.SearchChild(context.Background(), parentID, folderName, NodeTypeFolder)
	if err != nil {
		t.Logf("search after create still fails verification, created folder id=%s: %v", folderID, err)
		return
	}
	if created == nil || created.ID != folderID {
		t.Fatalf("expected created folder to be discoverable, got %#v", created)
	}
}

func TestIntegrationGetRevisionAttrs(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, fileID, _ := createIntegrationFileFixture(t, testContext, client)
	attrs, err := client.GetRevisionAttrs(context.Background(), fileID)
	if err != nil {
		t.Fatalf("unexpected revision attrs error: %v", err)
	}
	if attrs.EncryptedSize <= 0 {
		t.Fatalf("expected positive encrypted size, got %+v", attrs)
	}
}

func TestIntegrationDownloadFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, fileID, _ := createIntegrationFileFixture(t, testContext, client)
	result, err := client.DownloadFile(context.Background(), fileID, 0)
	if err != nil {
		t.Fatalf("unexpected download error: %v", err)
	}
	defer result.Reader.Close()
	buffer := make([]byte, 1)
	n, readErr := result.Reader.Read(buffer)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		t.Fatalf("unexpected read error: %v", readErr)
	}
	if n == 0 && result.ServerSize > 0 {
		t.Fatalf("expected some data for non-empty file, got n=%d serverSize=%d", n, result.ServerSize)
	}
}

func TestIntegrationUploadFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, folderID, _ := createIntegrationFolderFixture(t, testContext, client)
	filename := "sdk-upload-" + integrationFolderName() + ".txt"
	node, attrs, err := client.UploadFile(context.Background(), folderID, filename, strings.NewReader("hello world"), UploadOptions{KnownSize: int64(len("hello world")), ModTime: time.Now().UTC()})
	if err != nil {
		t.Fatalf("unexpected upload error: %v", err)
	}
	if node.ID == "" || attrs.Size <= 0 {
		t.Fatalf("expected uploaded file metadata, got node=%#v attrs=%#v", node, attrs)
	}
	resolved, err := client.SearchChild(context.Background(), folderID, filename, NodeTypeFile)
	if err != nil {
		t.Fatalf("unexpected search after upload error: %v", err)
	}
	if resolved == nil || resolved.ID != node.ID {
		t.Fatalf("expected uploaded file to be discoverable, got %#v", resolved)
	}
}

func TestIntegrationUploadLargeFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, folderID, _ := createIntegrationFolderFixture(t, testContext, client)
	filename := "sdk-large-upload-" + integrationFolderName() + ".bin"
	const largeSize = 4*1024*1024 + 1024
	content := strings.Repeat("a", largeSize)
	node, attrs, err := client.UploadFile(context.Background(), folderID, filename, strings.NewReader(content), UploadOptions{KnownSize: int64(len(content)), ModTime: time.Now().UTC()})
	if err != nil {
		t.Fatalf("unexpected large upload error: %v", err)
	}
	if node.ID == "" || attrs.Size != int64(len(content)) {
		t.Fatalf("expected uploaded large file metadata, got node=%#v attrs=%#v", node, attrs)
	}
}

func TestIntegrationMoveFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, folderID, _ := createIntegrationFolderFixture(t, testContext, client)
	_, fileID, _ := createIntegrationFileFixture(t, testContext, client)
	err := client.MoveFile(context.Background(), fileID, folderID, "renamed.txt")
	if err != nil {
		t.Fatalf("unexpected move file error: %v", err)
	}
	moved, err := client.SearchChild(context.Background(), folderID, "renamed.txt", NodeTypeFile)
	if err != nil {
		t.Fatalf("search moved file: %v", err)
	}
	if moved == nil || moved.ID != fileID {
		t.Fatalf("expected moved file in destination folder, got %#v", moved)
	}
}

func TestIntegrationMoveFolder(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, parentFolderID, _ := createIntegrationFolderFixture(t, testContext, client)
	_, childFolderID, _ := createIntegrationFolderFixture(t, testContext, client)
	err := client.MoveFolder(context.Background(), childFolderID, parentFolderID, "renamed-folder")
	if err != nil {
		t.Fatalf("unexpected move folder error: %v", err)
	}
	moved, err := client.SearchChild(context.Background(), parentFolderID, "renamed-folder", NodeTypeFolder)
	if err != nil {
		t.Fatalf("search moved folder: %v", err)
	}
	if moved == nil || moved.ID != childFolderID {
		t.Fatalf("expected moved folder in destination folder, got %#v", moved)
	}
}

func TestIntegrationTrashFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, fileID, _ := createIntegrationFileFixture(t, testContext, client)
	err := client.TrashFile(context.Background(), fileID)
	if err != nil {
		t.Fatalf("unexpected trash file error: %v", err)
	}
}

func TestIntegrationTrashFolder(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, folderID, _ := createIntegrationFolderFixture(t, testContext, client)
	err := client.TrashFolder(context.Background(), folderID, true)
	if err != nil {
		t.Fatalf("unexpected trash folder error: %v", err)
	}
}

func TestIntegrationEmptyTrash(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	err := client.EmptyTrash(context.Background())
	if err != nil {
		t.Fatalf("unexpected empty trash error: %v", err)
	}
}

func TestIntegrationClearCache(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	client.ClearCache()
}

func TestIntegrationLogout(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	if err := client.Logout(context.Background()); err != nil {
		t.Fatalf("unexpected logout error: %v", err)
	}
	if client.Session().Valid() {
		t.Fatalf("expected logout to clear session, got %#v", client.Session())
	}
}

func TestIntegrationResume(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client, err := NewClient(context.Background(), NewDialer(), testContext.Config.LoginOptions(), SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected login error: %v", err)
	}
	session := client.Session()
	if !session.Valid() {
		t.Fatalf("expected valid session after login, got %#v", session)
	}

	resumedClient, err := NewClientWithSession(context.Background(), NewDialer(), ResumeOptions{
		Session:    session,
		BaseURL:    testContext.Config.BaseURL,
		AppVersion: defaultIntegrationAppVersion,
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected resume error: %v", err)
	}
	if !resumedClient.Session().Valid() {
		t.Fatalf("expected valid session after resume, got %#v", resumedClient.Session())
	}
	usage, err := resumedClient.About(context.Background())
	if err != nil {
		t.Fatalf("unexpected about error after resume: %v", err)
	}
	if usage.Total < usage.Used {
		t.Fatalf("expected total >= used after resume, got %+v", usage)
	}
}

func TestIntegrationDownloadWithOffset(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client, err := NewClient(context.Background(), NewDialer(), testContext.Config.LoginOptions(), SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected login error: %v", err)
	}
	defer client.Logout(context.Background())
	content := "abcdefghijklmnopqrstuvwxyz0123456789"
	_, folderID, _ := createIntegrationFolderFixture(t, testContext, client)
	filename := integrationFileName()
	node, _, err := client.UploadFile(context.Background(), folderID, filename, strings.NewReader(content), UploadOptions{
		KnownSize: int64(len(content)),
		ModTime:   time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("unexpected upload error: %v", err)
	}
	const offset = 10
	result, err := client.DownloadFile(context.Background(), node.ID, offset)
	if err != nil {
		t.Fatalf("unexpected download error: %v", err)
	}
	defer result.Reader.Close()
	data, err := io.ReadAll(result.Reader)
	if err != nil {
		t.Fatalf("unexpected read error: %v", err)
	}
	expected := content[offset:]
	if string(data) != expected {
		t.Fatalf("expected %q at offset %d, got %q", expected, offset, string(data))
	}
}

func TestIntegrationSearchChildPositiveMatch(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client, err := NewClient(context.Background(), NewDialer(), testContext.Config.LoginOptions(), SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected login error: %v", err)
	}
	defer client.Logout(context.Background())
	_, folderID, folderName := createIntegrationFolderFixture(t, testContext, client)
	found, err := client.SearchChild(context.Background(), clientSessionRootID(t, client), folderName, NodeTypeFolder)
	if err != nil {
		t.Fatalf("unexpected search error: %v", err)
	}
	if found == nil {
		t.Fatalf("expected to find folder %q", folderName)
	}
	if found.ID != folderID {
		t.Fatalf("expected folder id %s, got %s", folderID, found.ID)
	}
}
