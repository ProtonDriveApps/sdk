package protondrive

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
)

// driveState holds the authenticated account state including keyrings, the main
// share, and the root link. It is populated during login/resume and used by
// all driver operations.
type driveState struct {
	volumeID         string
	user             proton.User
	addresses        []proton.Address
	userKR           *crypto.KeyRing
	addrKRs          map[string]*crypto.KeyRing
	mainShare        proton.Share
	rootLink         proton.Link
	mainShareKR      *crypto.KeyRing
	defaultAddrKR    *crypto.KeyRing
	saltedKeyPass    []byte
	nodeKeysByLinkID map[string]*nodeSecretMaterial
}

// nodeSecretMaterial caches the decrypted passphrase and session keys for a
// node so that move/rename operations can re-encrypt without re-deriving keys.
type nodeSecretMaterial struct {
	Passphrase           []byte
	PassphraseSessionKey *crypto.SessionKey
	NameSessionKey       *crypto.SessionKey
}

// standaloneDriverConfig is the construction-time configuration for a
// standaloneDriver.
type standaloneDriverConfig struct {
	manager    *proton.Manager
	client     *proton.Client
	baseURL    string
	appVersion string
	userAgent  string
	httpClient *http.Client
	hooks      SessionHooks
	session    Session
	state      *driveState
}

// standaloneDriver implements the Driver interface using the official
// Proton Mail Go client library directly (no cgo or native dependencies).
type standaloneDriver struct {
	mu         sync.RWMutex
	manager    *proton.Manager
	client     *proton.Client
	baseURL    string
	appVersion string
	userAgent  string
	httpClient *http.Client
	session    Session
	hooks      SessionHooks
	cache      map[string]Node
	rootID     string
	state      *driveState
}

func newStandaloneDriver(config standaloneDriverConfig) *standaloneDriver {
	httpClient := config.httpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	driver := &standaloneDriver{
		manager:    config.manager,
		client:     config.client,
		baseURL:    config.baseURL,
		appVersion: config.appVersion,
		userAgent:  config.userAgent,
		httpClient: httpClient,
		session:    config.session,
		hooks:      config.hooks,
		cache:      make(map[string]Node),
		rootID:     "root",
		state:      config.state,
	}
	if config.state != nil {
		driver.rootID = config.state.rootLink.LinkID
	}
	return driver
}

// About returns the authenticated account's storage quota.
func (d *standaloneDriver) About(ctx context.Context) (AccountUsage, error) {
	if d.client == nil {
		return AccountUsage{}, ErrNotAuthenticated
	}
	user, err := d.client.GetUser(ctx)
	if err != nil {
		return AccountUsage{}, err
	}
	free := user.MaxSpace - user.UsedSpace
	return AccountUsage{Total: int64(user.MaxSpace), Used: int64(user.UsedSpace), Free: int64(free)}, nil
}

// RootID returns the link ID of the drive root node.
func (d *standaloneDriver) RootID(context.Context) (string, error) {
	if d.rootID == "" {
		return "", ErrNotAuthenticated
	}
	return d.rootID, nil
}

// ListDirectory returns the active children of the given folder, decrypting
// their names using the parent's keyring.
func (d *standaloneDriver) ListDirectory(ctx context.Context, parentID string) ([]DirectoryEntry, error) {
	parent, err := d.getLink(ctx, parentID)
	if err != nil {
		return nil, err
	}
	if parent.Type != proton.LinkTypeFolder || parent.State != proton.LinkStateActive {
		return nil, nil
	}
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return nil, err
	}
	children, err := d.client.ListChildren(ctx, d.state.mainShare.ShareID, parent.LinkID, true)
	if err != nil {
		return nil, err
	}
	entries := make([]DirectoryEntry, 0, len(children))
	for _, child := range children {
		if child.State != proton.LinkStateActive {
			continue
		}
		name, err := decryptLinkName(child, parentKR, d.state.defaultAddrKR)
		if err != nil {
			continue
		}
		node := nodeFromLink(child, name)
		entries = append(entries, DirectoryEntry{Node: node, IsFolder: child.Type == proton.LinkTypeFolder})
		d.cacheNode(node)
	}
	return entries, nil
}

// SearchChild looks up a child by name hash and type under the given parent.
// Returns nil (no error) if the child is not found.
func (d *standaloneDriver) SearchChild(ctx context.Context, parentID, name string, nodeType NodeType) (*Node, error) {
	parent, err := d.getLink(ctx, parentID)
	if err != nil {
		return nil, err
	}
	if parent.Type != proton.LinkTypeFolder || parent.State != proton.LinkStateActive {
		return nil, nil
	}
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return nil, err
	}
	hashKey, err := parent.GetHashKey(parentKR)
	if err != nil {
		return nil, err
	}
	targetHash := getNameHash(name, hashKey)
	children, err := d.client.ListChildren(ctx, d.state.mainShare.ShareID, parent.LinkID, true)
	if err != nil {
		return nil, err
	}
	for _, child := range children {
		if child.State != proton.LinkStateActive || child.Hash != targetHash {
			continue
		}
		if nodeType == NodeTypeFile && child.Type != proton.LinkTypeFile {
			continue
		}
		if nodeType == NodeTypeFolder && child.Type != proton.LinkTypeFolder {
			continue
		}
		decryptedName, err := decryptLinkName(child, parentKR, d.state.defaultAddrKR)
		if err != nil {
			continue
		}
		node := nodeFromLink(child, decryptedName)
		d.cacheNode(node)
		return &node, nil
	}
	return nil, nil
}

// CreateFolder creates a new folder with the given name under the parent node.
// Returns the new folder's link ID.
func (d *standaloneDriver) CreateFolder(ctx context.Context, parentID, name string) (string, error) {
	parent, err := d.getLink(ctx, parentID)
	if err != nil {
		return "", err
	}
	if parent.Type != proton.LinkTypeFolder {
		return "", fmt.Errorf("parent link %s is not a folder", parentID)
	}
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return "", err
	}
	newNodeKey, nodeSecrets, passphraseEnc, passphraseSig, newNodeKR, err := d.generateNodeMaterial(parentKR)
	if err != nil {
		return "", err
	}
	parentHashKey, err := parent.GetHashKey(parentKR)
	if err != nil {
		return "", err
	}
	nodeHashKey, err := encryptNodeHashKey(newNodeKR)
	if err != nil {
		return "", err
	}
	req := proton.CreateFolderReq{
		ParentLinkID:            parent.LinkID,
		Name:                    mustEncryptArmored(parentKR, []byte(name)),
		Hash:                    getNameHash(name, parentHashKey),
		NodeKey:                 newNodeKey,
		NodeHashKey:             nodeHashKey,
		NodePassphrase:          passphraseEnc,
		NodePassphraseSignature: passphraseSig,
		SignatureAddress:        d.signatureAddress(),
	}
	created, err := d.client.CreateFolder(ctx, d.state.mainShare.ShareID, req)
	if err != nil {
		return "", err
	}
	d.storeNodeSecrets(created.ID, nodeSecrets)
	d.ClearCache()
	return created.ID, nil
}

// GetRevisionAttrs delegates to the download helpers.
func (d *standaloneDriver) GetRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	return d.getRevisionAttrs(ctx, nodeID)
}

// DownloadFile opens a streaming reader for the file, starting at the given
// byte offset. Blocks are fetched and decrypted lazily.
func (d *standaloneDriver) DownloadFile(ctx context.Context, nodeID string, offset int64) (DownloadResult, error) {
	link, err := d.getLink(ctx, nodeID)
	if err != nil {
		return DownloadResult{}, err
	}
	if link.Type != proton.LinkTypeFile {
		return DownloadResult{}, fmt.Errorf("link %s is not a file", nodeID)
	}
	nodeKR, err := d.getLinkKR(ctx, link)
	if err != nil {
		return DownloadResult{}, err
	}
	sessionKey, err := link.GetSessionKey(nodeKR)
	if err != nil {
		return DownloadResult{}, err
	}
	activeRevision, err := d.getActiveRevisionMetadata(ctx, link)
	if err != nil {
		return DownloadResult{}, err
	}
	revision, err := d.getRevisionAllBlocks(ctx, link.LinkID, activeRevision.ID)
	if err != nil {
		return DownloadResult{}, err
	}
	// Build revision attrs from the already-fetched data to avoid redundant API calls.
	attrs := RevisionAttrs{
		Size:          activeRevision.Size,
		ModTime:       time.Unix(link.ModifyTime, 0),
		Digests:       map[string]string{},
		EncryptedSize: link.Size,
	}
	const blockSize = 4 * 1024 * 1024
	attrs.BlockSizes = make([]int64, 0, len(revision.Blocks))
	remaining := attrs.Size
	for range revision.Blocks {
		if remaining <= 0 {
			attrs.BlockSizes = append(attrs.BlockSizes, 0)
		} else if remaining < blockSize {
			attrs.BlockSizes = append(attrs.BlockSizes, remaining)
			remaining = 0
		} else {
			attrs.BlockSizes = append(attrs.BlockSizes, blockSize)
			remaining -= blockSize
		}
	}
	reader := &fileDownloadReader{
		driver:     d,
		ctx:        ctx,
		link:       &link,
		nodeKR:     nodeKR,
		sessionKey: sessionKey,
		revision:   &revision,
		data:       bytes.NewBuffer(nil),
	}
	if offset > 0 {
		if len(attrs.BlockSizes) > 0 {
			blockIndex, intra, err := locateBlockOffset(attrs.BlockSizes, offset)
			if err != nil {
				return DownloadResult{}, err
			}
			reader.nextBlock = blockIndex
			if intra > 0 {
				if _, err := io.CopyN(io.Discard, reader, intra); err != nil {
					return DownloadResult{}, fmt.Errorf("seek within decrypted stream: %w", err)
				}
			}
		} else {
			if _, err := io.CopyN(io.Discard, reader, offset); err != nil {
				return DownloadResult{}, fmt.Errorf("seek within decrypted stream: %w", err)
			}
		}
	}
	return DownloadResult{Reader: reader, Attrs: attrs, ServerSize: link.Size}, nil
}

// UploadFile delegates to the upload helpers (see upload.go).
func (d *standaloneDriver) UploadFile(ctx context.Context, parentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	return d.uploadFile(ctx, parentID, name, body, options)
}

// MoveFile moves a file node to a new parent with an optional rename.
func (d *standaloneDriver) MoveFile(ctx context.Context, nodeID, parentID, name string) error {
	return d.moveNode(ctx, nodeID, parentID, name)
}

// MoveFolder moves a folder node to a new parent with an optional rename.
func (d *standaloneDriver) MoveFolder(ctx context.Context, nodeID, parentID, name string) error {
	return d.moveNode(ctx, nodeID, parentID, name)
}

// TrashFile moves a single file to the trash.
func (d *standaloneDriver) TrashFile(ctx context.Context, nodeID string) error {
	return d.trashLinks(ctx, []string{nodeID})
}

// TrashFolder moves a folder to the trash. The recursive parameter is accepted
// but the Proton API handles folder trash as a unit operation.
func (d *standaloneDriver) TrashFolder(ctx context.Context, nodeID string, recursive bool) error {
	return d.trashLinks(ctx, []string{nodeID})
}

// EmptyTrash permanently deletes all items in the trash.
func (d *standaloneDriver) EmptyTrash(ctx context.Context) error {
	return d.emptyTrash(ctx)
}

// ClearCache drops all cached node metadata.
func (d *standaloneDriver) ClearCache() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.cache = make(map[string]Node)
}

// Session returns a snapshot of the current authentication session.
func (d *standaloneDriver) Session() Session {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.session
}

func (d *standaloneDriver) setSession(session Session) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.session = session
}

func (d *standaloneDriver) clearSession() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.session = Session{}
}

// Logout revokes the authentication tokens, closes connections, clears
// private key material, and emits a deauth hook.
func (d *standaloneDriver) Logout(ctx context.Context) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.client != nil {
		if err := d.client.AuthDelete(ctx); err != nil {
			return err
		}
		d.client.Close()
		d.client = nil
	}
	if d.manager != nil {
		d.manager.Close()
		d.manager = nil
	}
	if d.state != nil {
		if d.state.userKR != nil {
			d.state.userKR.ClearPrivateParams()
		}
		for _, keyring := range d.state.addrKRs {
			keyring.ClearPrivateParams()
		}
	}
	d.session = Session{}
	d.state = nil
	d.rootID = ""
	d.hooks.emitDeauth()
	return nil
}

// SaltedKeyPass returns the base64-encoded salted key passphrase for session
// persistence.
func (d *standaloneDriver) SaltedKeyPass() string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.session.SaltedKeyPass
}

// getLink fetches a link by ID, short-circuiting for the cached root link.
func (d *standaloneDriver) getLink(ctx context.Context, linkID string) (proton.Link, error) {
	if linkID == "" {
		return proton.Link{}, fmt.Errorf("link id is required")
	}
	if d.state != nil && d.state.rootLink.LinkID == linkID {
		return d.state.rootLink, nil
	}
	return d.client.GetLink(ctx, d.state.mainShare.ShareID, linkID)
}

// getLinkKR derives the keyring for a link by recursively resolving parent
// keyrings up to the share root.
func (d *standaloneDriver) getLinkKR(ctx context.Context, link proton.Link) (*crypto.KeyRing, error) {
	if link.ParentLinkID == "" {
		return link.GetKeyRing(d.state.mainShareKR, d.state.defaultAddrKR)
	}
	parent, err := d.getLink(ctx, link.ParentLinkID)
	if err != nil {
		return nil, err
	}
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return nil, err
	}
	return link.GetKeyRing(parentKR, d.state.defaultAddrKR)
}

// cacheNode stores a node in the in-memory cache by ID.
func (d *standaloneDriver) cacheNode(node Node) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.cache[node.ID] = node
}

// storeNodeSecrets saves a deep copy of the node's secret material so that
// future move/rename operations can re-encrypt without re-deriving keys.
func (d *standaloneDriver) storeNodeSecrets(linkID string, material *nodeSecretMaterial) {
	if d.state == nil || linkID == "" || material == nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.state.nodeKeysByLinkID == nil {
		d.state.nodeKeysByLinkID = map[string]*nodeSecretMaterial{}
	}
	d.state.nodeKeysByLinkID[linkID] = copyNodeSecretMaterial(material)
}

// getStoredNodeSecrets returns a deep copy of the cached secret material for
// a node, or (nil, false) if not cached.
func (d *standaloneDriver) getStoredNodeSecrets(linkID string) (*nodeSecretMaterial, bool) {
	if d.state == nil || linkID == "" {
		return nil, false
	}
	d.mu.RLock()
	defer d.mu.RUnlock()
	value, ok := d.state.nodeKeysByLinkID[linkID]
	if !ok {
		return nil, false
	}
	return copyNodeSecretMaterial(value), true
}

// copyNodeSecretMaterial creates a deep copy of node secret material to
// prevent shared mutable state across goroutines.
func copyNodeSecretMaterial(src *nodeSecretMaterial) *nodeSecretMaterial {
	cp := &nodeSecretMaterial{Passphrase: append([]byte(nil), src.Passphrase...)}
	if src.PassphraseSessionKey != nil {
		cp.PassphraseSessionKey = crypto.NewSessionKeyFromToken(src.PassphraseSessionKey.Key, src.PassphraseSessionKey.Algo)
	}
	if src.NameSessionKey != nil {
		cp.NameSessionKey = crypto.NewSessionKeyFromToken(src.NameSessionKey.Key, src.NameSessionKey.Algo)
	}
	return cp
}

// moveNode moves a file or folder link to a new parent, re-encrypting the
// node passphrase and name for the destination keyring.
func (d *standaloneDriver) moveNode(ctx context.Context, nodeID, parentID, name string) error {
	link, err := d.getLink(ctx, nodeID)
	if err != nil {
		return err
	}
	if link.ParentLinkID == "" {
		return fmt.Errorf("cannot move root node")
	}
	// Resolve destination parent keyring.
	destParent, err := d.getLink(ctx, parentID)
	if err != nil {
		return err
	}
	destKR, err := d.getLinkKR(ctx, destParent)
	if err != nil {
		return err
	}
	// Resolve origin parent keyring for hash lookup.
	originParent, err := d.getLink(ctx, link.ParentLinkID)
	if err != nil {
		return err
	}
	originKR, err := d.getLinkKR(ctx, originParent)
	if err != nil {
		return err
	}
	originHashKey, err := originParent.GetHashKey(originKR)
	if err != nil {
		return err
	}
	originalName, err := decryptLinkName(link, originKR, d.state.defaultAddrKR)
	if err != nil {
		return err
	}
	if name == "" {
		name = originalName
	}
	destHashKey, err := destParent.GetHashKey(destKR)
	if err != nil {
		return err
	}
	nameEnc, err := d.reencryptNodeName(nodeID, name, destKR)
	if err != nil {
		return err
	}
	passphrasePacket, _, _, err := d.reencryptNodePassphrase(nodeID, destKR)
	if err != nil {
		return err
	}
	if err := d.moveLink(ctx, nodeID, moveLinkReq{
		ParentLinkID:            parentID,
		Name:                    nameEnc,
		OriginalHash:            getNameHash(originalName, originHashKey),
		Hash:                    getNameHash(name, destHashKey),
		NodePassphrase:          passphrasePacket,
		NodePassphraseSignature: "",
		NameSignatureEmail:      d.signatureAddress(),
		SignatureAddress:        "",
	}); err != nil {
		return err
	}
	d.ClearCache()
	return nil
}

// reencryptNodePassphrase re-encrypts the node's passphrase for a new
// destination keyring. Returns the armored passphrase packet, signature,
// and signature address.
func (d *standaloneDriver) reencryptNodePassphrase(linkID string, destKR *crypto.KeyRing) (string, string, string, error) {
	material, ok := d.getStoredNodeSecrets(linkID)
	if !ok || material.PassphraseSessionKey == nil {
		return "", "", "", fmt.Errorf("node passphrase for %s is not available in local cache", linkID)
	}
	dataPacket, err := material.PassphraseSessionKey.Encrypt(crypto.NewPlainMessage(material.Passphrase))
	if err != nil {
		return "", "", "", err
	}
	detachedSig, err := d.state.defaultAddrKR.SignDetached(crypto.NewPlainMessage(material.Passphrase))
	if err != nil {
		return "", "", "", err
	}
	sigDataPacket, err := material.PassphraseSessionKey.Encrypt(crypto.NewPlainMessage(detachedSig.GetBinary()))
	if err != nil {
		return "", "", "", err
	}
	keyPacket, err := destKR.EncryptSessionKey(material.PassphraseSessionKey)
	if err != nil {
		return "", "", "", err
	}
	passphraseArm, err := crypto.NewPGPSplitMessage(keyPacket, dataPacket).GetArmored()
	if err != nil {
		return "", "", "", err
	}
	sigArm, err := crypto.NewPGPSplitMessage(keyPacket, sigDataPacket).GetArmored()
	if err != nil {
		return "", "", "", err
	}
	return passphraseArm, sigArm, d.signatureAddress(), nil
}

// reencryptNodeName re-encrypts a node's name for a new destination keyring.
func (d *standaloneDriver) reencryptNodeName(linkID, name string, destKR *crypto.KeyRing) (string, error) {
	material, ok := d.getStoredNodeSecrets(linkID)
	if !ok || material.NameSessionKey == nil {
		return getEncryptedName(name, d.state.defaultAddrKR, destKR)
	}
	encMsg, err := material.NameSessionKey.EncryptAndSign(crypto.NewPlainMessageFromString(name), d.state.defaultAddrKR)
	if err != nil {
		return "", err
	}
	split, err := crypto.NewPGPMessage(encMsg).SplitMessage()
	if err != nil {
		return "", err
	}
	keyPacket, err := destKR.EncryptSessionKey(material.NameSessionKey)
	if err != nil {
		return "", err
	}
	return crypto.NewPGPSplitMessage(keyPacket, split.GetBinaryDataPacket()).GetArmored()
}

// signatureAddress returns the email address to use for PGP signatures on
// drive operations. Prefers the share creator, falls back to the first enabled
// address.
func (d *standaloneDriver) signatureAddress() string {
	if d.state != nil && d.state.mainShare.Creator != "" {
		return d.state.mainShare.Creator
	}
	for _, address := range d.state.addresses {
		if address.Status == proton.AddressStatusEnabled {
			return address.Email
		}
	}
	return ""
}

// generateNodeMaterial creates all the cryptographic material needed for a new
// node: key pair, passphrase session key, name session key, encrypted
// passphrase, and unlocked keyring.
func (d *standaloneDriver) generateNodeMaterial(parentKR *crypto.KeyRing) (nodeKey string, secrets *nodeSecretMaterial, passphraseEnc, passphraseSig string, nodeKR *crypto.KeyRing, err error) {
	passphrase, keyArmored, err := generateCryptoKey()
	if err != nil {
		return
	}
	passphraseSK, err := generateSessionKey()
	if err != nil {
		return
	}
	nameSK, err := generateSessionKey()
	if err != nil {
		return
	}
	passphraseEnc, passphraseSig, err = encryptWithSignature(parentKR, d.state.defaultAddrKR, []byte(passphrase))
	if err != nil {
		return
	}
	nodeKR, err = getKeyRing(parentKR, d.state.defaultAddrKR, keyArmored, passphraseEnc, passphraseSig)
	if err != nil {
		return
	}
	nodeKey = keyArmored
	secrets = &nodeSecretMaterial{Passphrase: []byte(passphrase), PassphraseSessionKey: passphraseSK, NameSessionKey: nameSK}
	return
}

// bootstrapDriveState initializes the authenticated drive state by fetching the
// active volume, main share, root link, and building the necessary keyrings.
func bootstrapDriveState(ctx context.Context, client *proton.Client, user proton.User, addresses []proton.Address, userKR *crypto.KeyRing, addrKRs map[string]*crypto.KeyRing, saltedKeyPass []byte) (*driveState, error) {
	volumes, err := client.ListVolumes(ctx)
	if err != nil {
		return nil, err
	}
	var activeVolumeID, mainShareID string
	for _, volume := range volumes {
		if volume.State == proton.VolumeStateActive {
			activeVolumeID = volume.VolumeID
			mainShareID = volume.Share.ShareID
			break
		}
	}
	if mainShareID == "" {
		return nil, fmt.Errorf("no active drive volume found")
	}
	mainShare, err := client.GetShare(ctx, mainShareID)
	if err != nil {
		return nil, err
	}
	rootLink, err := client.GetLink(ctx, mainShare.ShareID, mainShare.LinkID)
	if err != nil {
		return nil, err
	}
	defaultAddrKR := addrKRs[mainShare.AddressID]
	if defaultAddrKR == nil {
		return nil, fmt.Errorf("missing address keyring for main share")
	}
	mainShareKR, err := mainShare.GetKeyRing(defaultAddrKR)
	if err != nil {
		return nil, err
	}
	return &driveState{
		volumeID:         activeVolumeID,
		user:             user,
		addresses:        addresses,
		userKR:           userKR,
		addrKRs:          addrKRs,
		mainShare:        mainShare,
		rootLink:         rootLink,
		mainShareKR:      mainShareKR,
		defaultAddrKR:    defaultAddrKR,
		saltedKeyPass:    append([]byte(nil), saltedKeyPass...),
		nodeKeysByLinkID: map[string]*nodeSecretMaterial{},
	}, nil
}

// detectMIMEType guesses the MIME type from a filename's extension.
func detectMIMEType(filename string) string {
	return mime.TypeByExtension(filepath.Ext(filename))
}
