package protondrive

import (
	"context"
	"io"
	"sync"
)

// FakeDialer is a test double that implements Dialer. It returns preconfigured
// Driver instances and records the last options received.
type FakeDialer struct {
	LoginDriver  Driver
	ResumeDriver Driver
	LoginErr     error
	ResumeErr    error
	LastLogin    LoginOptions
	LastResume   ResumeOptions
}

// Login records the options and returns the preconfigured LoginDriver.
func (f *FakeDialer) Login(_ context.Context, options LoginOptions, hooks SessionHooks) (Driver, error) {
	f.LastLogin = options
	if f.LoginErr != nil {
		return nil, f.LoginErr
	}
	if f.LoginDriver != nil {
		hooks.emitSession(f.LoginDriver.Session())
	}
	return f.LoginDriver, nil
}

// Resume records the options and returns the preconfigured ResumeDriver.
func (f *FakeDialer) Resume(_ context.Context, options ResumeOptions, hooks SessionHooks) (Driver, error) {
	f.LastResume = options
	if f.ResumeErr != nil {
		return nil, f.ResumeErr
	}
	if f.ResumeDriver != nil {
		hooks.emitSession(f.ResumeDriver.Session())
	}
	return f.ResumeDriver, nil
}

// FakeDriver is a test double that implements Driver with configurable return
// values for every method. It is safe for concurrent use.
type FakeDriver struct {
	mu              sync.Mutex
	SessionValue    Session
	AboutValue      AccountUsage
	AboutErr        error
	RootValue       string
	RootErr         error
	Entries         []DirectoryEntry
	ListErr         error
	NodeValue       *Node
	NodeErr         error
	FolderID        string
	CreateErr       error
	AttrsValue      RevisionAttrs
	AttrsErr        error
	DownloadValue   DownloadResult
	DownloadErr     error
	UploadNode      Node
	UploadAttrs     RevisionAttrs
	UploadErr       error
	MoveErr         error
	TrashErr        error
	EmptyTrashErr   error
	LogoutErr       error
	clearCacheCalls int
}

func (f *FakeDriver) About(context.Context) (AccountUsage, error) { return f.AboutValue, f.AboutErr }
func (f *FakeDriver) RootID(context.Context) (string, error)      { return f.RootValue, f.RootErr }
func (f *FakeDriver) ListDirectory(context.Context, string) ([]DirectoryEntry, error) {
	return f.Entries, f.ListErr
}
func (f *FakeDriver) SearchChild(context.Context, string, string, NodeType) (*Node, error) {
	return f.NodeValue, f.NodeErr
}
func (f *FakeDriver) CreateFolder(context.Context, string, string) (string, error) {
	return f.FolderID, f.CreateErr
}
func (f *FakeDriver) GetRevisionAttrs(context.Context, string) (RevisionAttrs, error) {
	return f.AttrsValue, f.AttrsErr
}
func (f *FakeDriver) DownloadFile(context.Context, string, int64) (DownloadResult, error) {
	return f.DownloadValue, f.DownloadErr
}
func (f *FakeDriver) UploadFile(context.Context, string, string, io.Reader, UploadOptions) (Node, RevisionAttrs, error) {
	return f.UploadNode, f.UploadAttrs, f.UploadErr
}
func (f *FakeDriver) MoveFile(context.Context, string, string, string) error   { return f.MoveErr }
func (f *FakeDriver) MoveFolder(context.Context, string, string, string) error { return f.MoveErr }
func (f *FakeDriver) TrashFile(context.Context, string) error                  { return f.TrashErr }
func (f *FakeDriver) TrashFolder(context.Context, string, bool) error          { return f.TrashErr }
func (f *FakeDriver) EmptyTrash(context.Context) error                         { return f.EmptyTrashErr }
func (f *FakeDriver) ClearCache() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.clearCacheCalls++
}
func (f *FakeDriver) Session() Session             { return f.SessionValue }
func (f *FakeDriver) Logout(context.Context) error { return f.LogoutErr }

// ClearCacheCalls returns the number of times ClearCache has been called.
func (f *FakeDriver) ClearCacheCalls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.clearCacheCalls
}
