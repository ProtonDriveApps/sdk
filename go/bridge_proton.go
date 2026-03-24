//go:build protonbridge

package protondrive

import (
	"context"
	"fmt"
	"io"
	"time"

	bridge "github.com/rclone/Proton-API-Bridge"
	proton "github.com/rclone/go-proton-api"
)

func NewBridgeDialer() Dialer {
	return BridgeDialer{}
}

type BridgeDialer struct{}

func (BridgeDialer) Login(ctx context.Context, options LoginOptions, hooks SessionHooks) (Driver, error) {
	config := bridge.NewDefaultConfig()
	applyCommonConfig(config, options.AppVersion, options.UserAgent, options.EnableCaching)
	config.UseReusableLogin = false
	config.FirstLoginCredential.Username = options.Username
	config.FirstLoginCredential.Password = options.Password
	config.FirstLoginCredential.MailboxPassword = options.MailboxPassword
	config.FirstLoginCredential.TwoFA = options.TwoFactorCode

	protonDrive, creds, err := bridge.NewProtonDrive(ctx, config, authHandler(hooks, func() string {
		return config.ReusableCredential.SaltedKeyPass
	}), deauthHandler(hooks))
	if err != nil {
		return nil, err
	}
	if creds != nil {
		hooks.emitSession(sessionFromBridgeCredential(creds))
	}
	return &BridgeDriver{drive: protonDrive, hooks: hooks}, nil
}

func (BridgeDialer) Resume(ctx context.Context, options ResumeOptions, hooks SessionHooks) (Driver, error) {
	config := bridge.NewDefaultConfig()
	applyCommonConfig(config, options.AppVersion, options.UserAgent, options.EnableCaching)
	config.UseReusableLogin = true
	config.ReusableCredential.UID = options.Session.UID
	config.ReusableCredential.AccessToken = options.Session.AccessToken
	config.ReusableCredential.RefreshToken = options.Session.RefreshToken
	config.ReusableCredential.SaltedKeyPass = options.Session.SaltedKeyPass

	protonDrive, _, err := bridge.NewProtonDrive(ctx, config, authHandler(hooks, func() string {
		return options.Session.SaltedKeyPass
	}), deauthHandler(hooks))
	if err != nil {
		return nil, err
	}
	hooks.emitSession(options.Session)
	return &BridgeDriver{drive: protonDrive, hooks: hooks}, nil
}

type BridgeDriver struct {
	drive *bridge.ProtonDrive
	hooks SessionHooks
}

func (d *BridgeDriver) About(ctx context.Context) (AccountUsage, error) {
	user, err := d.drive.About(ctx)
	if err != nil {
		return AccountUsage{}, err
	}
	return AccountUsage{Total: user.MaxSpace, Used: user.UsedSpace, Free: user.MaxSpace - user.UsedSpace}, nil
}

func (d *BridgeDriver) RootID(context.Context) (string, error) {
	if d.drive == nil || d.drive.MainShare == nil {
		return "", ErrNotAuthenticated
	}
	return d.drive.MainShare.LinkID, nil
}

func (d *BridgeDriver) ListDirectory(ctx context.Context, parentID string) ([]DirectoryEntry, error) {
	items, err := d.drive.ListDirectory(ctx, parentID)
	if err != nil {
		return nil, err
	}
	entries := make([]DirectoryEntry, 0, len(items))
	for _, item := range items {
		if item == nil || item.Link == nil {
			continue
		}
		entries = append(entries, DirectoryEntry{
			Node:     nodeFromLink(item.Link, item.Name),
			IsFolder: item.IsFolder,
		})
	}
	return entries, nil
}

func (d *BridgeDriver) SearchChild(ctx context.Context, parentID, name string, nodeType NodeType) (*Node, error) {
	searchForFile := nodeType != NodeTypeFolder
	searchForFolder := nodeType != NodeTypeFile
	link, err := d.drive.SearchByNameInActiveFolderByID(ctx, parentID, name, searchForFile, searchForFolder, proton.LinkStateActive)
	if err != nil {
		return nil, err
	}
	if link == nil {
		return nil, nil
	}
	return ptr(nodeFromLink(link, name)), nil
}

func (d *BridgeDriver) CreateFolder(ctx context.Context, parentID, name string) (string, error) {
	return d.drive.CreateNewFolderByID(ctx, parentID, name)
}

func (d *BridgeDriver) GetRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	attrs, err := d.drive.GetActiveRevisionAttrsByID(ctx, nodeID)
	if err != nil {
		return RevisionAttrs{}, err
	}
	if attrs == nil {
		return RevisionAttrs{}, nil
	}
	return revisionAttrsFromBridge(attrs, 0), nil
}

func (d *BridgeDriver) DownloadFile(ctx context.Context, nodeID string, offset int64) (DownloadResult, error) {
	reader, serverSize, attrs, err := d.drive.DownloadFileByID(ctx, nodeID, offset)
	if err != nil {
		return DownloadResult{}, err
	}
	result := DownloadResult{Reader: reader, ServerSize: serverSize}
	if attrs != nil {
		result.Attrs = revisionAttrsFromBridge(attrs, serverSize)
	} else {
		result.Attrs = RevisionAttrs{EncryptedSize: serverSize}
	}
	return result, nil
}

func (d *BridgeDriver) UploadFile(ctx context.Context, parentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	if options.KnownSize < 0 {
		return Node{}, RevisionAttrs{}, ErrUnknownSizeUpload
	}
	if options.ReplaceExistingDraft {
		previous := d.drive.Config.ReplaceExistingDraft
		d.drive.Config.ReplaceExistingDraft = true
		defer func() {
			d.drive.Config.ReplaceExistingDraft = previous
		}()
	}
	modTime := options.ModTime
	if modTime.IsZero() {
		modTime = time.Now()
	}
	linkID, attrs, err := d.drive.UploadFileByReader(ctx, parentID, name, modTime, body, 0)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	node := Node{ID: linkID, ParentID: parentID, Name: name, Type: NodeTypeFile, ModTime: modTime, MIMEType: fallbackMIMEType(options.MediaType)}
	if attrs != nil {
		rev := revisionAttrsFromRevisionCommon(attrs)
		node.Size = rev.Size
		node.OriginalSHA1 = rev.Digests["SHA1"]
		return node, rev, nil
	}
	return node, RevisionAttrs{}, nil
}

func (d *BridgeDriver) MoveFile(ctx context.Context, nodeID, parentID, name string) error {
	return d.drive.MoveFileByID(ctx, nodeID, parentID, name)
}

func (d *BridgeDriver) MoveFolder(ctx context.Context, nodeID, parentID, name string) error {
	return d.drive.MoveFolderByID(ctx, nodeID, parentID, name)
}

func (d *BridgeDriver) TrashFile(ctx context.Context, nodeID string) error {
	return d.drive.MoveFileToTrashByID(ctx, nodeID)
}

func (d *BridgeDriver) TrashFolder(ctx context.Context, nodeID string, recursive bool) error {
	return d.drive.MoveFolderToTrashByID(ctx, nodeID, !recursive)
}

func (d *BridgeDriver) EmptyTrash(ctx context.Context) error {
	return d.drive.EmptyTrash(ctx)
}

func (d *BridgeDriver) ClearCache() {
	d.drive.ClearCache()
}

func (d *BridgeDriver) Session() Session {
	if d.drive == nil || d.drive.Config == nil || d.drive.Config.ReusableCredential == nil {
		return Session{}
	}
	return sessionFromCredential(d.drive.Config.ReusableCredential)
}

func (d *BridgeDriver) Logout(ctx context.Context) error {
	err := d.drive.Logout(ctx)
	if err == nil {
		d.hooks.emitDeauth()
	}
	return err
}

func (d *BridgeDriver) String() string {
	return fmt.Sprintf("BridgeDriver(root=%s)", d.drive.MainShare.LinkID)
}
