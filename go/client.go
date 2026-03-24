package protondrive

import (
	"context"
	"fmt"
	"io"
	"strings"
)

type Client struct {
	driver Driver
	hooks  SessionHooks
}

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

func NewClientFromDriver(driver Driver, hooks SessionHooks) (*Client, error) {
	if driver == nil {
		return nil, ErrNotAuthenticated
	}
	return &Client{driver: driver, hooks: hooks}, nil
}

func (c *Client) Session() Session {
	if c == nil || c.driver == nil {
		return Session{}
	}
	return c.driver.Session()
}

func (c *Client) About(ctx context.Context) (AccountUsage, error) {
	if c == nil || c.driver == nil {
		return AccountUsage{}, ErrNotAuthenticated
	}
	return c.driver.About(ctx)
}

func (c *Client) RootID(ctx context.Context) (string, error) {
	if c == nil || c.driver == nil {
		return "", ErrNotAuthenticated
	}
	return c.driver.RootID(ctx)
}

func (c *Client) ListDirectory(ctx context.Context, parentID string) ([]DirectoryEntry, error) {
	if c == nil || c.driver == nil {
		return nil, ErrNotAuthenticated
	}
	return c.driver.ListDirectory(ctx, parentID)
}

func (c *Client) SearchChild(ctx context.Context, parentID, name string, nodeType NodeType) (*Node, error) {
	if c == nil || c.driver == nil {
		return nil, ErrNotAuthenticated
	}
	return c.driver.SearchChild(ctx, parentID, name, nodeType)
}

func (c *Client) CreateFolder(ctx context.Context, parentID, name string) (string, error) {
	if c == nil || c.driver == nil {
		return "", ErrNotAuthenticated
	}
	return c.driver.CreateFolder(ctx, parentID, name)
}

func (c *Client) GetRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	if c == nil || c.driver == nil {
		return RevisionAttrs{}, ErrNotAuthenticated
	}
	return c.driver.GetRevisionAttrs(ctx, nodeID)
}

func (c *Client) DownloadFile(ctx context.Context, nodeID string, offset int64) (DownloadResult, error) {
	if c == nil || c.driver == nil {
		return DownloadResult{}, ErrNotAuthenticated
	}
	return c.driver.DownloadFile(ctx, nodeID, offset)
}

func (c *Client) UploadFile(ctx context.Context, parentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	if c == nil || c.driver == nil {
		return Node{}, RevisionAttrs{}, ErrNotAuthenticated
	}
	if options.KnownSize < 0 {
		return Node{}, RevisionAttrs{}, ErrUnknownSizeUpload
	}
	return c.driver.UploadFile(ctx, parentID, name, body, options)
}

func (c *Client) MoveFile(ctx context.Context, nodeID, parentID, name string) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.MoveFile(ctx, nodeID, parentID, name)
}

func (c *Client) MoveFolder(ctx context.Context, nodeID, parentID, name string) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.MoveFolder(ctx, nodeID, parentID, name)
}

func (c *Client) TrashFile(ctx context.Context, nodeID string) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.TrashFile(ctx, nodeID)
}

func (c *Client) TrashFolder(ctx context.Context, nodeID string, recursive bool) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.TrashFolder(ctx, nodeID, recursive)
}

func (c *Client) EmptyTrash(ctx context.Context) error {
	if c == nil || c.driver == nil {
		return ErrNotAuthenticated
	}
	return c.driver.EmptyTrash(ctx)
}

func (c *Client) ClearCache() {
	if c == nil || c.driver == nil {
		return
	}
	c.driver.ClearCache()
}

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
