package protondrive

import (
	"context"
	"fmt"
	"io"
	"strings"
)

// Client is the public entry point for Proton Drive operations. It delegates
// all work to a Driver and validates inputs before forwarding calls.
type Client struct {
	driver Driver
	hooks  SessionHooks
}

// NewClient authenticates with Proton Drive using the provided Dialer and
// login credentials, returning a ready-to-use Client.
func NewClient(ctx context.Context, dialer Dialer, options LoginOptions, hooks SessionHooks) (*Client, error) {
	if dialer == nil {
		return nil, fmt.Errorf("dialer is required")
	}
	if strings.TrimSpace(options.Username) == "" || strings.TrimSpace(options.Password) == "" {
		return nil, ErrInvalidLogin
	}
	if strings.TrimSpace(options.AppVersion) == "" {
		return nil, fmt.Errorf("app version is required")
	}
	driver, err := dialer.Login(ctx, options, hooks)
	if err != nil {
		return nil, err
	}
	return &Client{driver: driver, hooks: hooks}, nil
}

// NewClientWithSession resumes a previously authenticated session without
// re-entering credentials.
func NewClientWithSession(ctx context.Context, dialer Dialer, options ResumeOptions, hooks SessionHooks) (*Client, error) {
	if dialer == nil {
		return nil, fmt.Errorf("dialer is required")
	}
	if !options.Session.Valid() {
		return nil, ErrInvalidSession
	}
	if strings.TrimSpace(options.AppVersion) == "" {
		return nil, fmt.Errorf("app version is required")
	}
	driver, err := dialer.Resume(ctx, options, hooks)
	if err != nil {
		return nil, err
	}
	return &Client{driver: driver, hooks: hooks}, nil
}

// NewClientFromDriver wraps an already-authenticated Driver in a Client. This
// is primarily useful in tests where a FakeDriver is injected directly.
func NewClientFromDriver(driver Driver, hooks SessionHooks) (*Client, error) {
	if driver == nil {
		return nil, ErrNotAuthenticated
	}
	return &Client{driver: driver, hooks: hooks}, nil
}

// Session returns the current authentication session.
func (c *Client) Session() Session {
	if c == nil || c.driver == nil {
		return Session{}
	}
	return c.driver.Session()
}

// About returns storage quota information for the authenticated account.
func (c *Client) About(ctx context.Context) (AccountUsage, error) {
	if c == nil || c.driver == nil {
		return AccountUsage{}, ErrNotAuthenticated
	}
	return c.driver.About(ctx)
}

// RootID returns the identifier of the root node in the drive volume.
func (c *Client) RootID(ctx context.Context) (string, error) {
	if c == nil || c.driver == nil {
		return "", ErrNotAuthenticated
	}
	return c.driver.RootID(ctx)
}

// ListDirectory returns the direct children of the given folder node.
func (c *Client) ListDirectory(ctx context.Context, parentID string) ([]DirectoryEntry, error) {
	if c == nil || c.driver == nil {
		return nil, ErrNotAuthenticated
	}
	return c.driver.ListDirectory(ctx, parentID)
}

// SearchChild looks up a child node by name and type under the given parent.
func (c *Client) SearchChild(ctx context.Context, parentID, name string, nodeType NodeType) (*Node, error) {
	if c == nil || c.driver == nil {
		return nil, ErrNotAuthenticated
	}
	return c.driver.SearchChild(ctx, parentID, name, nodeType)
}

// CreateFolder creates a new folder with the given name under parentID and
// returns its node ID.
func (c *Client) CreateFolder(ctx context.Context, parentID, name string) (string, error) {
	if c == nil || c.driver == nil {
		return "", ErrNotAuthenticated
	}
	return c.driver.CreateFolder(ctx, parentID, name)
}

// GetRevisionAttrs returns metadata for the current revision of the given file node.
func (c *Client) GetRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	if c == nil || c.driver == nil {
		return RevisionAttrs{}, ErrNotAuthenticated
	}
	return c.driver.GetRevisionAttrs(ctx, nodeID)
}

// DownloadFile opens a reader for the file content starting at the given byte offset.
func (c *Client) DownloadFile(ctx context.Context, nodeID string, offset int64) (DownloadResult, error) {
	if c == nil || c.driver == nil {
		return DownloadResult{}, ErrNotAuthenticated
	}
	return c.driver.DownloadFile(ctx, nodeID, offset)
}

// UploadFile uploads body as a file with the given name under destParentID.
// The KnownSize field in options must be set to a non-negative value.
func (c *Client) UploadFile(ctx context.Context, destParentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	if c == nil || c.driver == nil {
		return Node{}, RevisionAttrs{}, ErrNotAuthenticated
	}
	if options.KnownSize < 0 {
		return Node{}, RevisionAttrs{}, ErrUnknownSizeUpload
	}
	return c.driver.UploadFile(ctx, destParentID, name, body, options)
}

// MoveFile relocates the file node to a new parent folder with a new name.
func (c *Client) MoveFile(ctx context.Context, nodeID, newParentID, name string) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.MoveFile(ctx, nodeID, newParentID, name)
}

// MoveFolder relocates the folder node to a new parent folder with a new name.
func (c *Client) MoveFolder(ctx context.Context, nodeID, newParentID, name string) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.MoveFolder(ctx, nodeID, newParentID, name)
}

// TrashFile moves the file to the trash.
func (c *Client) TrashFile(ctx context.Context, nodeID string) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.TrashFile(ctx, nodeID)
}

// TrashFolder moves the folder to the trash. The recursive parameter is accepted
// for interface consistency but the Proton API trashes folders as a unit.
func (c *Client) TrashFolder(ctx context.Context, nodeID string, recursive bool) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.TrashFolder(ctx, nodeID, recursive)
}

// EmptyTrash permanently deletes all items in the trash.
func (c *Client) EmptyTrash(ctx context.Context) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.EmptyTrash(ctx)
}

// ClearCache drops any in-memory node cache held by the driver.
func (c *Client) ClearCache() {
	if c == nil || c.driver == nil {
		return
	}
	c.driver.ClearCache()
}

// Logout ends the session and emits a deauthentication hook on success.
func (c *Client) Logout(ctx context.Context) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	err := c.driver.Logout(ctx)
	if err == nil {
		c.hooks.emitDeauth()
	}
	return err
}
