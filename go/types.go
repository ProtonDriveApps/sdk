// Package protondrive provides a pure-Go client for basic Proton Drive operations
// including login, directory listing, file upload/download, move, and trash.
package protondrive

import (
	"context"
	"io"
	"net/http"
	"time"
)

// LoginOptions holds the credentials and configuration needed to authenticate
// with Proton Drive. BaseURL is optional and defaults to the production API.
type LoginOptions struct {
	BaseURL         string
	Username        string
	Password        string
	MailboxPassword string
	TwoFactorCode   string // Pre-generated 6-digit TOTP code (used if TOTPSecret is empty)
	TOTPSecret      string // Base32 TOTP secret; if set, the 2FA code is generated automatically
	AppVersion      string
	UserAgent       string
	HTTPClient      *http.Client // Optional; defaults to http.DefaultClient
	EnableCaching   bool
}

// ResumeOptions holds a previously persisted session for reconnecting without
// re-entering credentials.
type ResumeOptions struct {
	BaseURL       string
	Session       Session
	AppVersion    string
	UserAgent     string
	HTTPClient    *http.Client // Optional; defaults to http.DefaultClient
	EnableCaching bool
}

// NodeType identifies whether a drive node is a file or folder.
type NodeType string

const (
	NodeTypeFile   NodeType = "file"
	NodeTypeFolder NodeType = "folder"
)

// AccountUsage reports storage quota information for the authenticated account.
type AccountUsage struct {
	Total int64
	Used  int64
	Free  int64
}

// Node represents a file or folder in the Proton Drive tree.
type Node struct {
	ID           string
	ParentID     string
	Name         string
	Type         NodeType
	Size         int64
	MIMEType     string
	ModTime      time.Time
	CreateTime   time.Time
	OriginalSHA1 string
}

// RevisionAttrs contains metadata about a file revision including size,
// checksums, and block layout.
type RevisionAttrs struct {
	Size          int64
	ModTime       time.Time
	Digests       map[string]string
	BlockSizes    []int64
	EncryptedSize int64
}

// DirectoryEntry pairs a Node with a flag indicating whether it is a folder.
type DirectoryEntry struct {
	Node     Node
	IsFolder bool
}

// UploadOptions configures optional parameters for file uploads.
type UploadOptions struct {
	ReplaceExistingDraft bool
	MediaType            string
	ModTime              time.Time
	KnownSize            int64
}

// DownloadResult wraps an open reader, revision metadata, and server-reported
// size for a downloaded file.
type DownloadResult struct {
	Reader     io.ReadCloser
	Attrs      RevisionAttrs
	ServerSize int64
}

// Driver is the core interface that concrete Proton Drive backends must
// implement. The public Client type delegates all operations to a Driver.
type Driver interface {
	About(context.Context) (AccountUsage, error)
	RootID(context.Context) (string, error)
	ListDirectory(context.Context, string) ([]DirectoryEntry, error)
	SearchChild(context.Context, string, string, NodeType) (*Node, error)
	CreateFolder(context.Context, string, string) (string, error)
	GetRevisionAttrs(context.Context, string) (RevisionAttrs, error)
	DownloadFile(context.Context, string, int64) (DownloadResult, error)
	UploadFile(context.Context, string, string, io.Reader, UploadOptions) (Node, RevisionAttrs, error)
	MoveFile(context.Context, string, string, string) error
	MoveFolder(context.Context, string, string, string) error
	TrashFile(context.Context, string) error
	TrashFolder(context.Context, string, bool) error
	EmptyTrash(context.Context) error
	ClearCache()
	Session() Session
	Logout(context.Context) error
}

// Dialer creates Driver instances by performing login or session-resume flows.
type Dialer interface {
	Login(context.Context, LoginOptions, SessionHooks) (Driver, error)
	Resume(context.Context, ResumeOptions, SessionHooks) (Driver, error)
}
