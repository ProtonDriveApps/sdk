//go:build integration

package protondrive

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestLoadIntegrationConfigMissingFile(t *testing.T) {
	_, err := LoadIntegrationConfig("integration/does-not-exist.json")
	if !errors.Is(err, ErrMissingCredentialsFile) {
		t.Fatalf("expected ErrMissingCredentialsFile, got %v", err)
	}
}

func TestIntegrationConfigProducesLoginOptions(t *testing.T) {
	config := IntegrationConfig{
		Username:      "user",
		Password:      "pass",
		AppVersion:    "external-drive-rclone@1.0.0",
		UserAgent:     "rclone/test",
		EnableCaching: true,
	}
	options := config.LoginOptions()
	if options.Username != config.Username || options.AppVersion != config.AppVersion || !options.EnableCaching {
		t.Fatalf("unexpected login options: %#v", options)
	}
}

func TestStandaloneIntegrationHarnessBootstrapsFromConfig(t *testing.T) {
	driver, err := NewDialer().Login(context.Background(), LoginOptions{
		Username:   "user",
		Password:   "pass",
		AppVersion: "external-drive-rclone@1.0.0",
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !driver.Session().Valid() {
		t.Fatalf("expected placeholder standalone session, got %#v", driver.Session())
	}
}

func TestCompatibilityCoverageEnumeratesAllRcloneOperations(t *testing.T) {
	coverage := integrationCoverageChecklist()
	required := []string{
		"Login",
		"Resume",
		"RootID",
		"ListDirectory",
		"SearchChild",
		"CreateFolder",
		"GetRevisionAttrs",
		"DownloadFile",
		"UploadFile",
		"MoveFile",
		"MoveFolder",
		"TrashFile",
		"TrashFolder",
		"EmptyTrash",
		"About",
		"ClearCache",
		"Logout",
	}

	for _, operation := range required {
		if _, ok := coverage[operation]; !ok {
			t.Fatalf("expected coverage checklist to include %q", operation)
		}
	}
	if len(coverage) != len(required) {
		t.Fatalf("expected %d checklist items, got %d", len(required), len(coverage))
	}
}

func TestIntegrationConfigValidatesCredentialPresence(t *testing.T) {
	config := IntegrationConfig{AppVersion: "external-drive-rclone@1.0.0"}
	if err := config.Validate(); err == nil {
		t.Fatal("expected missing credential validation error")
	}

	config.Username = "user"
	config.Password = "pass"
	if err := config.Validate(); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestIntegrationCoverageChecklistStatuses(t *testing.T) {
	coverage := integrationCoverageChecklist()
	for operation, status := range coverage {
		if !strings.Contains("implemented scaffolded planned", status) {
			t.Fatalf("unexpected status %q for operation %q", status, operation)
		}
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

func TestIntegrationResumeWithCredentials(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client, err := NewClientWithSession(context.Background(), NewDialer(), ResumeOptions{
		Session:       Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"},
		AppVersion:    testContext.Config.AppVersion,
		UserAgent:     testContext.Config.UserAgent,
		EnableCaching: testContext.Config.EnableCaching,
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected resume error: %v", err)
	}
	if !client.Session().Valid() {
		t.Fatalf("expected valid session after resume, got %#v", client.Session())
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
	_, err := client.About(context.Background())
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented until Proton backend is implemented, got %v", err)
	}
}

func TestIntegrationListDirectory(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, err := client.ListDirectory(context.Background(), firstNonEmpty(testContext.Config.TestFolderID, "root"))
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationSearchChild(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, err := client.SearchChild(context.Background(), firstNonEmpty(testContext.Config.TestFolderID, "root"), "example.txt", NodeTypeFile)
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationCreateFolder(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, err := client.CreateFolder(context.Background(), firstNonEmpty(testContext.Config.TestFolderID, "root"), "sdk-integration-folder")
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationGetRevisionAttrs(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	if testContext.Config.TestFileID == "" {
		t.Skip("integration config missing test_file_id")
	}
	client := requireIntegrationClient(t, testContext)
	_, err := client.GetRevisionAttrs(context.Background(), testContext.Config.TestFileID)
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationDownloadFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	if testContext.Config.TestFileID == "" {
		t.Skip("integration config missing test_file_id")
	}
	client := requireIntegrationClient(t, testContext)
	_, err := client.DownloadFile(context.Background(), testContext.Config.TestFileID, 0)
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationUploadFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	_, _, err := client.UploadFile(context.Background(), firstNonEmpty(testContext.Config.TestFolderID, "root"), "sdk-upload.txt", strings.NewReader("hello world"), UploadOptions{KnownSize: int64(len("hello world"))})
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationMoveFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	if testContext.Config.TestFileID == "" {
		t.Skip("integration config missing test_file_id")
	}
	client := requireIntegrationClient(t, testContext)
	err := client.MoveFile(context.Background(), testContext.Config.TestFileID, firstNonEmpty(testContext.Config.TestFolderID, "root"), "renamed.txt")
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationMoveFolder(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	if testContext.Config.TestFolderID == "" {
		t.Skip("integration config missing test_folder_id")
	}
	client := requireIntegrationClient(t, testContext)
	err := client.MoveFolder(context.Background(), testContext.Config.TestFolderID, "root", "renamed-folder")
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationTrashFile(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	if testContext.Config.TestFileID == "" {
		t.Skip("integration config missing test_file_id")
	}
	client := requireIntegrationClient(t, testContext)
	err := client.TrashFile(context.Background(), testContext.Config.TestFileID)
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationTrashFolder(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	if testContext.Config.TestFolderID == "" {
		t.Skip("integration config missing test_folder_id")
	}
	client := requireIntegrationClient(t, testContext)
	err := client.TrashFolder(context.Background(), testContext.Config.TestFolderID, true)
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
	}
}

func TestIntegrationEmptyTrash(t *testing.T) {
	testContext := requireIntegrationTestContext(t)
	client := requireIntegrationClient(t, testContext)
	err := client.EmptyTrash(context.Background())
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("expected placeholder ErrNotImplemented, got %v", err)
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
