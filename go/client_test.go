package protondrive

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestNewClientValidatesRequiredFields(t *testing.T) {
	_, err := NewClient(context.Background(), &FakeDialer{}, LoginOptions{}, SessionHooks{})
	if !errors.Is(err, ErrInvalidLogin) {
		t.Fatalf("expected ErrInvalidLogin, got %v", err)
	}
}

func TestNewClientWithSessionValidatesSession(t *testing.T) {
	_, err := NewClientWithSession(context.Background(), &FakeDialer{}, ResumeOptions{AppVersion: "proton-drive-go-sdk-test@1.0.0"}, SessionHooks{})
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession, got %v", err)
	}
}

func TestNewClientWithSessionSuccess(t *testing.T) {
	expected := Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"}
	dialer := &FakeDialer{ResumeDriver: &FakeDriver{SessionValue: expected}}
	client, err := NewClientWithSession(context.Background(), dialer, ResumeOptions{
		Session:    expected,
		AppVersion: "proton-drive-go-sdk-test@1.0.0",
		BaseURL:    "https://mail.proton.me/api",
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client.Session() != expected {
		t.Fatalf("unexpected session: %#v", client.Session())
	}
}

func TestNewClientEmitsSessionFromDialer(t *testing.T) {
	expected := Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"}
	var got Session
	client, err := NewClient(
		context.Background(),
		&FakeDialer{LoginDriver: &FakeDriver{SessionValue: expected}},
		LoginOptions{BaseURL: "https://mail.proton.me/api", Username: "user", Password: "pass", AppVersion: "proton-drive-go-sdk-test@1.0.0"},
		SessionHooks{OnSession: func(session Session) { got = session }},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client.Session() != expected {
		t.Fatalf("unexpected session: %#v", client.Session())
	}
	if got != expected {
		t.Fatalf("expected session hook %#v, got %#v", expected, got)
	}
}

func TestUploadRejectsUnknownSize(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, _, err = client.UploadFile(context.Background(), "parent", "name", strings.NewReader("hello"), UploadOptions{KnownSize: -1})
	if !errors.Is(err, ErrUnknownSizeUpload) {
		t.Fatalf("expected ErrUnknownSizeUpload, got %v", err)
	}
}

func TestLogoutEmitsDeauth(t *testing.T) {
	called := false
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{OnDeauth: func() { called = true }})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.Logout(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Fatal("expected deauth hook to be called")
	}
}

func TestSessionValidity(t *testing.T) {
	if (Session{}).Valid() {
		t.Fatal("empty session should be invalid")
	}
	if !(&FakeDriver{SessionValue: Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"}}).Session().Valid() {
		t.Fatal("expected session to be valid")
	}
}

func TestNewDialerCreatesStandaloneDriver(t *testing.T) {
	client, err := NewClient(context.Background(), &FakeDialer{LoginDriver: &FakeDriver{SessionValue: Session{
		UID: "user",
	}}}, LoginOptions{
		BaseURL:    "https://mail.proton.me/api",
		Username:   "user",
		Password:   "pass",
		AppVersion: "proton-drive-go-sdk-test@1.0.0",
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client.Session().UID != "user" {
		t.Fatalf("expected fake driver session, got %#v", client.Session())
	}
	if _, err := client.About(context.Background()); err != nil {
		t.Fatalf("expected fake driver to return zero usage without error, got %v", err)
	}
}

func TestRootID(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{RootValue: "root-123"}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	id, err := client.RootID(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "root-123" {
		t.Fatalf("expected root-123, got %s", id)
	}
}

func TestRootIDError(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{RootErr: errors.New("no root")}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err = client.RootID(context.Background())
	if err == nil || err.Error() != "no root" {
		t.Fatalf("expected 'no root' error, got %v", err)
	}
}

func TestListDirectory(t *testing.T) {
	entries := []DirectoryEntry{
		{Node: Node{ID: "1", Name: "a.txt"}, IsFolder: false},
		{Node: Node{ID: "2", Name: "folder"}, IsFolder: true},
	}
	client, err := NewClientFromDriver(&FakeDriver{Entries: entries}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, err := client.ListDirectory(context.Background(), "parent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(got))
	}
	if got[0].Node.Name != "a.txt" || !got[1].IsFolder {
		t.Fatalf("unexpected entries: %#v", got)
	}
}

func TestSearchChild(t *testing.T) {
	node := &Node{ID: "child-1", Name: "target.txt", Type: NodeTypeFile}
	client, err := NewClientFromDriver(&FakeDriver{NodeValue: node}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, err := client.SearchChild(context.Background(), "parent", "target.txt", NodeTypeFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != "child-1" {
		t.Fatalf("expected child-1, got %s", got.ID)
	}
}

func TestSearchChildNotFound(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{NodeValue: nil}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, err := client.SearchChild(context.Background(), "parent", "missing", NodeTypeFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil, got %#v", got)
	}
}

func TestCreateFolder(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{FolderID: "new-folder-id"}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	id, err := client.CreateFolder(context.Background(), "parent", "new-folder")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "new-folder-id" {
		t.Fatalf("expected new-folder-id, got %s", id)
	}
}

func TestGetRevisionAttrs(t *testing.T) {
	attrs := RevisionAttrs{Size: 1024, Digests: map[string]string{"SHA1": "abc123"}}
	client, err := NewClientFromDriver(&FakeDriver{AttrsValue: attrs}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, err := client.GetRevisionAttrs(context.Background(), "node-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Size != 1024 || got.Digests["SHA1"] != "abc123" {
		t.Fatalf("unexpected attrs: %#v", got)
	}
}

func TestDownloadFile(t *testing.T) {
	body := io.NopCloser(strings.NewReader("file content"))
	dl := DownloadResult{Reader: body, Attrs: RevisionAttrs{Size: 12}, ServerSize: 12}
	client, err := NewClientFromDriver(&FakeDriver{DownloadValue: dl}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, err := client.DownloadFile(context.Background(), "node-1", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := io.ReadAll(got.Reader)
	_ = got.Reader.Close()
	if err != nil {
		t.Fatalf("unexpected error reading: %v", err)
	}
	if string(data) != "file content" {
		t.Fatalf("expected 'file content', got %s", data)
	}
}

func TestMoveFile(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.MoveFile(context.Background(), "node-1", "new-parent", "new-name"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMoveFileError(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{MoveErr: errors.New("move failed")}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	err = client.MoveFile(context.Background(), "node-1", "new-parent", "new-name")
	if err == nil || err.Error() != "move failed" {
		t.Fatalf("expected 'move failed' error, got %v", err)
	}
}

func TestMoveFolder(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.MoveFolder(context.Background(), "node-1", "new-parent", "new-name"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestTrashFile(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.TrashFile(context.Background(), "node-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestTrashFileError(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{TrashErr: errors.New("trash failed")}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	err = client.TrashFile(context.Background(), "node-1")
	if err == nil || err.Error() != "trash failed" {
		t.Fatalf("expected 'trash failed' error, got %v", err)
	}
}

func TestTrashFolder(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.TrashFolder(context.Background(), "node-1", true); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEmptyTrash(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.EmptyTrash(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestClearCache(t *testing.T) {
	d := &FakeDriver{}
	client, err := NewClientFromDriver(d, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	client.ClearCache()
	if d.ClearCacheCalls() != 1 {
		t.Fatalf("expected 1 ClearCache call, got %d", d.ClearCacheCalls())
	}
	client.ClearCache()
	if d.ClearCacheCalls() != 2 {
		t.Fatalf("expected 2 ClearCache calls, got %d", d.ClearCacheCalls())
	}
}

func TestFakeDialerResume(t *testing.T) {
	expected := Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"}
	driver := &FakeDriver{SessionValue: expected}
	dialer := &FakeDialer{ResumeDriver: driver}
	gotDriver, err := dialer.Resume(context.Background(), ResumeOptions{
		Session:    expected,
		AppVersion: "test",
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotDriver.Session() != expected {
		t.Fatalf("unexpected session: %#v", gotDriver.Session())
	}
	if dialer.LastResume.AppVersion != "test" {
		t.Fatalf("expected last resume app version 'test', got %s", dialer.LastResume.AppVersion)
	}
}

func TestFakeDialerResumeError(t *testing.T) {
	dialer := &FakeDialer{ResumeErr: errors.New("resume failed")}
	_, err := dialer.Resume(context.Background(), ResumeOptions{Session: Session{UID: "u", AccessToken: "a", RefreshToken: "r", SaltedKeyPass: "s"}}, SessionHooks{})
	if err == nil || err.Error() != "resume failed" {
		t.Fatalf("expected 'resume failed' error, got %v", err)
	}
}

func TestNilClientMethodsReturnErrors(t *testing.T) {
	var c *Client
	if _, err := c.About(context.Background()); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for About, got %v", err)
	}
	if _, err := c.RootID(context.Background()); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for RootID, got %v", err)
	}
	if _, err := c.ListDirectory(context.Background(), ""); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for ListDirectory, got %v", err)
	}
	if _, err := c.SearchChild(context.Background(), "", "", NodeTypeFile); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for SearchChild, got %v", err)
	}
	if _, err := c.CreateFolder(context.Background(), "", ""); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for CreateFolder, got %v", err)
	}
	if _, err := c.GetRevisionAttrs(context.Background(), ""); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for GetRevisionAttrs, got %v", err)
	}
	if _, _, err := c.UploadFile(context.Background(), "", "", nil, UploadOptions{}); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for UploadFile, got %v", err)
	}
	if err := c.MoveFile(context.Background(), "", "", ""); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for MoveFile, got %v", err)
	}
	if err := c.MoveFolder(context.Background(), "", "", ""); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for MoveFolder, got %v", err)
	}
	if err := c.TrashFile(context.Background(), ""); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for TrashFile, got %v", err)
	}
	if err := c.TrashFolder(context.Background(), "", false); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for TrashFolder, got %v", err)
	}
	if err := c.EmptyTrash(context.Background()); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for EmptyTrash, got %v", err)
	}
	if err := c.Logout(context.Background()); !errors.Is(err, ErrNotAuthenticated) {
		t.Fatalf("expected ErrNotAuthenticated for Logout, got %v", err)
	}
	c.ClearCache()
}

func TestUploadSuccess(t *testing.T) {
	node := Node{ID: "uploaded-id", Name: "hello.txt", Type: NodeTypeFile}
	attrs := RevisionAttrs{Size: 5, Digests: map[string]string{"SHA1": "sha1"}}
	client, err := NewClientFromDriver(&FakeDriver{UploadNode: node, UploadAttrs: attrs}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	gotNode, gotAttrs, err := client.UploadFile(context.Background(), "parent", "hello.txt", strings.NewReader("hello"), UploadOptions{KnownSize: 5})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotNode.ID != "uploaded-id" {
		t.Fatalf("expected uploaded-id, got %s", gotNode.ID)
	}
	if gotAttrs.Size != 5 {
		t.Fatalf("expected size 5, got %d", gotAttrs.Size)
	}
}
