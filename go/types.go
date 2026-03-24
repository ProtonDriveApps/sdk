package protondrive

import (
	"context"
	"io"
	"time"
)

type LoginOptions struct {
	Username        string
	Password        string
	MailboxPassword string
	TwoFactorCode   string
	AppVersion      string
	UserAgent       string
	EnableCaching   bool
}

type ResumeOptions struct {
	Session       Session
	AppVersion    string
	UserAgent     string
	EnableCaching bool
}

type NodeType string

const (
	NodeTypeFile   NodeType = "file"
	NodeTypeFolder NodeType = "folder"
)

type AccountUsage struct {
	Total int64
	Used  int64
	Free  int64
}

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

type RevisionAttrs struct {
	Size          int64
	ModTime       time.Time
	Digests       map[string]string
	BlockSizes    []int64
	EncryptedSize int64
}

type DirectoryEntry struct {
	Node     Node
	IsFolder bool
}

type UploadOptions struct {
	ReplaceExistingDraft bool
	MediaType            string
	ModTime              time.Time
	KnownSize            int64
}

type DownloadResult struct {
	Reader     io.ReadCloser
	Attrs      RevisionAttrs
	ServerSize int64
}

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

type Dialer interface {
	Login(context.Context, LoginOptions, SessionHooks) (Driver, error)
	Resume(context.Context, ResumeOptions, SessionHooks) (Driver, error)
}
