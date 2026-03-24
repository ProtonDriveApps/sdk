package protondrive

import (
	"context"
	"io"
	"sync"
)

type standaloneDriver struct {
	mu      sync.RWMutex
	session Session
	hooks   SessionHooks
	cache   map[string]Node
	rootID  string
}

func newStandaloneDriver(session Session, hooks SessionHooks) Driver {
	driver := &standaloneDriver{
		session: session,
		hooks:   hooks,
		cache:   make(map[string]Node),
		rootID:  "root",
	}
	if session.Valid() {
		hooks.emitSession(session)
	}
	return driver
}

func (d *standaloneDriver) About(context.Context) (AccountUsage, error) {
	return AccountUsage{}, ErrNotImplemented
}

func (d *standaloneDriver) RootID(context.Context) (string, error) {
	return d.rootID, nil
}

func (d *standaloneDriver) ListDirectory(context.Context, string) ([]DirectoryEntry, error) {
	return nil, ErrNotImplemented
}

func (d *standaloneDriver) SearchChild(context.Context, string, string, NodeType) (*Node, error) {
	return nil, ErrNotImplemented
}

func (d *standaloneDriver) CreateFolder(context.Context, string, string) (string, error) {
	return "", ErrNotImplemented
}

func (d *standaloneDriver) GetRevisionAttrs(context.Context, string) (RevisionAttrs, error) {
	return RevisionAttrs{}, ErrNotImplemented
}

func (d *standaloneDriver) DownloadFile(context.Context, string, int64) (DownloadResult, error) {
	return DownloadResult{}, ErrNotImplemented
}

func (d *standaloneDriver) UploadFile(context.Context, string, string, io.Reader, UploadOptions) (Node, RevisionAttrs, error) {
	return Node{}, RevisionAttrs{}, ErrNotImplemented
}

func (d *standaloneDriver) MoveFile(context.Context, string, string, string) error {
	return ErrNotImplemented
}

func (d *standaloneDriver) MoveFolder(context.Context, string, string, string) error {
	return ErrNotImplemented
}

func (d *standaloneDriver) TrashFile(context.Context, string) error {
	return ErrNotImplemented
}

func (d *standaloneDriver) TrashFolder(context.Context, string, bool) error {
	return ErrNotImplemented
}

func (d *standaloneDriver) EmptyTrash(context.Context) error {
	return ErrNotImplemented
}

func (d *standaloneDriver) ClearCache() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.cache = make(map[string]Node)
}

func (d *standaloneDriver) Session() Session {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.session
}

func (d *standaloneDriver) Logout(context.Context) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.session = Session{}
	d.hooks.emitDeauth()
	return nil
}

func loginSessionFromOptions(options LoginOptions) Session {
	if options.Username == "" {
		return Session{}
	}
	return Session{
		UID:           options.Username,
		AccessToken:   "login-pending",
		RefreshToken:  "login-pending",
		SaltedKeyPass: "login-pending",
	}
}
