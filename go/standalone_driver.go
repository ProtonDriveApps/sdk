package protondrive

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"sync"
	"time"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
	"github.com/ProtonMail/gopenpgp/v2/helper"
)

type driveState struct {
	volumeID      string
	user          proton.User
	addresses     []proton.Address
	userKR        *crypto.KeyRing
	addrKRs       map[string]*crypto.KeyRing
	mainShare     proton.Share
	rootLink      proton.Link
	mainShareKR   *crypto.KeyRing
	defaultAddrKR *crypto.KeyRing
	saltedKeyPass []byte
}

type standaloneDriverConfig struct {
	manager    *proton.Manager
	client     *proton.Client
	appVersion string
	hooks      SessionHooks
	session    Session
	state      *driveState
}

type standaloneDriver struct {
	mu         sync.RWMutex
	manager    *proton.Manager
	client     *proton.Client
	appVersion string
	session    Session
	hooks      SessionHooks
	cache      map[string]Node
	rootID     string
	state      *driveState
}

func newStandaloneDriver(config standaloneDriverConfig) *standaloneDriver {
	driver := &standaloneDriver{
		manager:    config.manager,
		client:     config.client,
		appVersion: config.appVersion,
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

func (d *standaloneDriver) RootID(context.Context) (string, error) {
	if d.rootID == "" {
		return "", ErrNotAuthenticated
	}
	return d.rootID, nil
}

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
			return nil, err
		}
		node := nodeFromLink(child, name)
		entries = append(entries, DirectoryEntry{Node: node, IsFolder: child.Type == proton.LinkTypeFolder})
		d.cacheNode(node)
	}
	return entries, nil
}

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
			return nil, err
		}
		node := nodeFromLink(child, decryptedName)
		d.cacheNode(node)
		return &node, nil
	}
	return nil, nil
}

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
	newNodeKey, nodePassphraseEnc, nodePassphraseSignature, newNodeKR, err := d.generateNodeMaterial(parentKR)
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
		NodePassphrase:          nodePassphraseEnc,
		NodePassphraseSignature: nodePassphraseSignature,
		SignatureAddress:        d.signatureAddress(),
	}
	created, err := d.client.CreateFolder(ctx, d.state.mainShare.ShareID, req)
	if err != nil {
		return "", err
	}
	d.ClearCache()
	return created.ID, nil
}

func (d *standaloneDriver) GetRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	return d.getRevisionAttrs(ctx, nodeID)
}

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
	attrs, err := d.getRevisionAttrs(ctx, nodeID)
	if err != nil {
		return DownloadResult{}, err
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
				n, err := io.CopyN(io.Discard, reader, intra)
				if err != nil {
					return DownloadResult{}, err
				}
				if n != intra {
					return DownloadResult{}, fmt.Errorf("failed to seek within decrypted stream")
				}
			}
		} else {
			n, err := io.CopyN(io.Discard, reader, offset)
			if err != nil {
				return DownloadResult{}, err
			}
			if n != offset {
				return DownloadResult{}, fmt.Errorf("failed to seek within decrypted stream")
			}
		}
	}
	return DownloadResult{Reader: reader, Attrs: attrs, ServerSize: link.Size}, nil
}

func (d *standaloneDriver) UploadFile(ctx context.Context, parentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	return d.uploadFile(ctx, parentID, name, body, options)
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

func (d *standaloneDriver) SaltedKeyPass() string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.session.SaltedKeyPass
}

func (d *standaloneDriver) getLink(ctx context.Context, linkID string) (proton.Link, error) {
	if linkID == "" {
		return proton.Link{}, fmt.Errorf("link id is required")
	}
	if d.state != nil && d.state.rootLink.LinkID == linkID {
		return d.state.rootLink, nil
	}
	return d.client.GetLink(ctx, d.state.mainShare.ShareID, linkID)
}

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

func (d *standaloneDriver) cacheNode(node Node) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.cache[node.ID] = node
}

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

func (d *standaloneDriver) generateNodeMaterial(parentKR *crypto.KeyRing) (string, string, string, *crypto.KeyRing, error) {
	passphrase, keyArmored, err := generateCryptoKey()
	if err != nil {
		return "", "", "", nil, err
	}
	passphraseEnc, passphraseSig, err := encryptWithSignature(parentKR, d.state.defaultAddrKR, []byte(passphrase))
	if err != nil {
		return "", "", "", nil, err
	}
	keyring, err := getKeyRing(parentKR, d.state.defaultAddrKR, keyArmored, passphraseEnc, passphraseSig)
	if err != nil {
		return "", "", "", nil, err
	}
	return keyArmored, passphraseEnc, passphraseSig, keyring, nil
}

func bootstrapDriveState(ctx context.Context, manager *proton.Manager, client *proton.Client, user proton.User, addresses []proton.Address, userKR *crypto.KeyRing, addrKRs map[string]*crypto.KeyRing, saltedKeyPass []byte) (*driveState, error) {
	volumes, err := client.ListVolumes(ctx)
	if err != nil {
		return nil, err
	}
	mainShareID := ""
	activeVolumeID := ""
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
	_ = manager
	return &driveState{
		volumeID:      activeVolumeID,
		user:          user,
		addresses:     addresses,
		userKR:        userKR,
		addrKRs:       addrKRs,
		mainShare:     mainShare,
		rootLink:      rootLink,
		mainShareKR:   mainShareKR,
		defaultAddrKR: defaultAddrKR,
		saltedKeyPass: append([]byte(nil), saltedKeyPass...),
	}, nil
}

func nodeFromLink(link proton.Link, name string) Node {
	nodeType := NodeTypeFile
	if link.Type == proton.LinkTypeFolder {
		nodeType = NodeTypeFolder
	}
	return Node{
		ID:           link.LinkID,
		ParentID:     link.ParentLinkID,
		Name:         name,
		Type:         nodeType,
		Size:         link.Size,
		MIMEType:     link.MIMEType,
		ModTime:      time.Unix(link.ModifyTime, 0),
		CreateTime:   time.Unix(link.CreateTime, 0),
		OriginalSHA1: "",
	}
}

func generatePassphrase() (string, error) {
	token, err := crypto.RandomToken(32)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(token), nil
}

func generateCryptoKey() (string, string, error) {
	passphrase, err := generatePassphrase()
	if err != nil {
		return "", "", err
	}
	armored, err := helper.GenerateKey("Drive key", "noreply@protonmail.com", []byte(passphrase), "x25519", 0)
	if err != nil {
		return "", "", err
	}
	return passphrase, armored, nil
}

func encryptWithSignature(kr, addrKR *crypto.KeyRing, data []byte) (string, string, error) {
	enc, err := kr.Encrypt(crypto.NewPlainMessage(data), nil)
	if err != nil {
		return "", "", err
	}
	encArm, err := enc.GetArmored()
	if err != nil {
		return "", "", err
	}
	sig, err := addrKR.SignDetached(crypto.NewPlainMessage(data))
	if err != nil {
		return "", "", err
	}
	sigArm, err := sig.GetArmored()
	if err != nil {
		return "", "", err
	}
	return encArm, sigArm, nil
}

func getKeyRing(kr, addrKR *crypto.KeyRing, key, passphrase, passphraseSignature string) (*crypto.KeyRing, error) {
	enc, err := crypto.NewPGPMessageFromArmored(passphrase)
	if err != nil {
		return nil, err
	}
	dec, err := kr.Decrypt(enc, nil, crypto.GetUnixTime())
	if err != nil {
		return nil, err
	}
	sig, err := crypto.NewPGPSignatureFromArmored(passphraseSignature)
	if err != nil {
		return nil, err
	}
	if err := addrKR.VerifyDetached(dec, sig, crypto.GetUnixTime()); err != nil {
		return nil, err
	}
	lockedKey, err := crypto.NewKeyFromArmored(key)
	if err != nil {
		return nil, err
	}
	unlockedKey, err := lockedKey.Unlock(dec.GetBinary())
	if err != nil {
		return nil, err
	}
	return crypto.NewKeyRing(unlockedKey)
}

func mustEncryptArmored(kr *crypto.KeyRing, data []byte) string {
	enc, err := kr.Encrypt(crypto.NewPlainMessage(data), nil)
	if err != nil {
		panic(err)
	}
	armored, err := enc.GetArmored()
	if err != nil {
		panic(err)
	}
	return armored
}

func encryptNodeHashKey(nodeKR *crypto.KeyRing) (string, error) {
	token, err := crypto.RandomToken(32)
	if err != nil {
		return "", err
	}
	enc, err := nodeKR.Encrypt(crypto.NewPlainMessage(token), nodeKR)
	if err != nil {
		return "", err
	}
	return enc.GetArmored()
}

func getNameHash(name string, hashKey []byte) string {
	h := hmac.New(sha256.New, hashKey)
	_, _ = h.Write([]byte(name))
	return hex.EncodeToString(h.Sum(nil))
}

func (d *standaloneDriver) getRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	link, err := d.getLink(ctx, nodeID)
	if err != nil {
		return RevisionAttrs{}, err
	}
	if link.Type != proton.LinkTypeFile {
		return RevisionAttrs{}, fmt.Errorf("link %s is not a file", nodeID)
	}
	activeRevision, err := d.getActiveRevisionMetadata(ctx, link)
	if err != nil {
		return RevisionAttrs{}, err
	}
	attrs := RevisionAttrs{
		Size:          activeRevision.Size,
		ModTime:       time.Unix(link.ModifyTime, 0),
		Digests:       map[string]string{},
		BlockSizes:    nil,
		EncryptedSize: link.Size,
	}
	revision, err := d.getRevisionAllBlocks(ctx, link.LinkID, activeRevision.ID)
	if err != nil {
		return RevisionAttrs{}, err
	}
	attrs.BlockSizes = make([]int64, 0, len(revision.Blocks))
	for range revision.Blocks {
		attrs.BlockSizes = append(attrs.BlockSizes, 4*1024*1024)
	}
	if len(attrs.BlockSizes) > 0 {
		remaining := attrs.Size
		for i := range attrs.BlockSizes {
			if remaining <= 0 {
				attrs.BlockSizes[i] = 0
				continue
			}
			if remaining < attrs.BlockSizes[i] {
				attrs.BlockSizes[i] = remaining
			}
			remaining -= attrs.BlockSizes[i]
		}
	}
	return attrs, nil
}

func (d *standaloneDriver) getActiveRevisionMetadata(ctx context.Context, link proton.Link) (proton.RevisionMetadata, error) {
	revisions, err := d.client.ListRevisions(ctx, d.state.mainShare.ShareID, link.LinkID)
	if err != nil {
		return proton.RevisionMetadata{}, err
	}
	var active *proton.RevisionMetadata
	for i := range revisions {
		if revisions[i].State == proton.RevisionStateActive {
			if active != nil {
				return proton.RevisionMetadata{}, fmt.Errorf("multiple active revisions for %s", link.LinkID)
			}
			active = &revisions[i]
		}
	}
	if active == nil {
		return proton.RevisionMetadata{}, fmt.Errorf("no active revision for %s", link.LinkID)
	}
	return *active, nil
}

func (d *standaloneDriver) getRevisionAllBlocks(ctx context.Context, linkID, revisionID string) (proton.Revision, error) {
	const pageSize = 150
	fromBlock := 1
	var full proton.Revision
	for {
		revision, err := d.client.GetRevision(ctx, d.state.mainShare.ShareID, linkID, revisionID, fromBlock, pageSize)
		if err != nil {
			return proton.Revision{}, err
		}
		if fromBlock == 1 {
			full.RevisionMetadata = revision.RevisionMetadata
		}
		full.Blocks = append(full.Blocks, revision.Blocks...)
		if len(revision.Blocks) < pageSize {
			break
		}
		fromBlock = len(full.Blocks) + 1
	}
	return full, nil
}

type fileDownloadReader struct {
	driver     *standaloneDriver
	ctx        context.Context
	link       *proton.Link
	data       *bytes.Buffer
	nodeKR     *crypto.KeyRing
	sessionKey *crypto.SessionKey
	revision   *proton.Revision
	nextBlock  int
	isEOF      bool
}

func (r *fileDownloadReader) Read(p []byte) (int, error) {
	if r.data.Len() == 0 {
		r.data = bytes.NewBuffer(nil)
		if err := r.populate(); err != nil {
			return 0, err
		}
		if r.isEOF {
			return 0, io.EOF
		}
	}
	return r.data.Read(p)
}

func (r *fileDownloadReader) Close() error {
	r.driver = nil
	return nil
}

func (r *fileDownloadReader) populate() error {
	if r.revision == nil || len(r.revision.Blocks) == 0 || r.nextBlock >= len(r.revision.Blocks) {
		r.isEOF = true
		return nil
	}
	block := r.revision.Blocks[r.nextBlock]
	blockReader, err := r.driver.client.GetBlock(r.ctx, block.BareURL, block.Token)
	if err != nil {
		return err
	}
	defer blockReader.Close()
	verificationKR, err := r.driver.buildSignatureVerificationKR([]string{block.SignatureEmail}, r.nodeKR)
	if err != nil {
		return err
	}
	if err := decryptBlockIntoBuffer(r.sessionKey, verificationKR, r.nodeKR, block.Hash, block.EncSignature, r.data, blockReader); err != nil {
		return err
	}
	r.nextBlock++
	return nil
}

func (d *standaloneDriver) buildSignatureVerificationKR(emails []string, extra ...*crypto.KeyRing) (*crypto.KeyRing, error) {
	ret, err := crypto.NewKeyRing(nil)
	if err != nil {
		return nil, err
	}
	for _, email := range emails {
		for _, address := range d.state.addresses {
			if address.Email != email {
				continue
			}
			if kr := d.state.addrKRs[address.ID]; kr != nil {
				if err := addKeysFromKR(ret, kr); err != nil {
					return nil, err
				}
			}
		}
	}
	if err := addKeysFromKR(ret, extra...); err != nil {
		return nil, err
	}
	if ret.CountEntities() == 0 {
		return nil, fmt.Errorf("no keys available for signature verification")
	}
	return ret, nil
}

func addKeysFromKR(kr *crypto.KeyRing, newKRs ...*crypto.KeyRing) error {
	for _, newKR := range newKRs {
		if newKR == nil {
			continue
		}
		for _, key := range newKR.GetKeys() {
			if err := kr.AddKey(key); err != nil {
				return err
			}
		}
	}
	return nil
}

func decryptBlockIntoBuffer(sessionKey *crypto.SessionKey, addrKR, nodeKR *crypto.KeyRing, originalHash, encSignature string, buffer io.Writer, block io.ReadCloser) error {
	data, err := io.ReadAll(block)
	if err != nil {
		return err
	}
	plainMessage, err := sessionKey.Decrypt(data)
	if err != nil {
		return err
	}
	encSignatureArm, err := crypto.NewPGPMessageFromArmored(encSignature)
	if err != nil {
		return err
	}
	if err := addrKR.VerifyDetachedEncrypted(plainMessage, encSignatureArm, nodeKR, crypto.GetUnixTime()); err != nil {
		return err
	}
	if _, err := io.Copy(buffer, plainMessage.NewReader()); err != nil {
		return err
	}
	h := sha256.New()
	h.Write(data)
	if base64.StdEncoding.EncodeToString(h.Sum(nil)) != originalHash {
		return fmt.Errorf("downloaded block hash verification failed")
	}
	return nil
}

func locateBlockOffset(blockSizes []int64, offset int64) (int, int64, error) {
	if offset < 0 {
		return 0, 0, fmt.Errorf("offset must be non-negative")
	}
	cumulative := int64(0)
	for i, size := range blockSizes {
		if offset < cumulative+size {
			return i, offset - cumulative, nil
		}
		cumulative += size
	}
	if offset == cumulative {
		return len(blockSizes), 0, nil
	}
	return 0, 0, io.EOF
}

func decryptLinkName(link proton.Link, parentKR, verificationKR *crypto.KeyRing) (string, error) {
	name, err := link.GetName(parentKR, verificationKR)
	if err == nil {
		return name, nil
	}
	encName, parseErr := crypto.NewPGPMessageFromArmored(link.Name)
	if parseErr != nil {
		return "", err
	}
	decName, decryptErr := parentKR.Decrypt(encName, nil, crypto.GetUnixTime())
	if decryptErr != nil {
		return "", err
	}
	return decName.GetString(), nil
}

func (d *standaloneDriver) uploadFile(ctx context.Context, parentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	parent, err := d.getLink(ctx, parentID)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	mimeType := options.MediaType
	if mimeType == "" {
		mimeType = mime.TypeByExtension(filepath.Ext(name))
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if options.KnownSize >= 0 && options.KnownSize <= 4*1024*1024 {
		return d.uploadSmallFileFlow(ctx, parent, parentID, name, mimeType, body, options)
	}
	linkID, revisionID, sessionKey, nodeKR, err := d.createFileUploadDraft(ctx, parent, name, mimeType)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	manifestSignatureData, fileSize, blockSizes, sha1Digest, blockTokens, err := d.uploadAndCollectBlockData(ctx, sessionKey, nodeKR, body, linkID, revisionID)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	modTime := options.ModTime
	if modTime.IsZero() {
		modTime = time.Now().UTC()
	}
	xAttrCommon := &revisionXAttrCommon{
		ModificationTime: modTime.Format("2006-01-02T15:04:05-0700"),
		Size:             fileSize,
		BlockSizes:       blockSizes,
		Digests: map[string]string{
			"SHA1": sha1Digest,
		},
	}
	_ = xAttrCommon
	if err := d.commitNewRevision(ctx, nodeKR, xAttrCommon, manifestSignatureData, linkID, revisionID, blockTokens); err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	d.ClearCache()
	node := Node{ID: linkID, ParentID: parentID, Name: name, Type: NodeTypeFile, Size: fileSize, MIMEType: mimeType, ModTime: modTime, CreateTime: time.Now().UTC(), OriginalSHA1: sha1Digest}
	attrs := RevisionAttrs{Size: fileSize, ModTime: modTime, Digests: map[string]string{"SHA1": sha1Digest}, BlockSizes: blockSizes, EncryptedSize: fileSize}
	return node, attrs, nil
}

func (d *standaloneDriver) uploadSmallFileFlow(ctx context.Context, parent proton.Link, parentID, name, mimeType string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	newNodeKey, newNodePassphraseEnc, newNodePassphraseSignature, newNodeKR, err := d.generateNodeMaterial(parentKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	parentHashKey, err := parent.GetHashKey(parentKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	contentSessionKey, contentKeyPacket, contentKeyPacketSignature, err := createContentKeyPacketAndSignature(newNodeKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	content, err := io.ReadAll(body)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	if options.KnownSize >= 0 && int64(len(content)) != options.KnownSize {
		return Node{}, RevisionAttrs{}, fmt.Errorf("content size %d does not match expected size %d", len(content), options.KnownSize)
	}
	plain := crypto.NewPlainMessage(content)
	encryptedBlock, err := contentSessionKey.Encrypt(plain)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	armoredBlockSignature, err := signEncryptedBlock(d.state.defaultAddrKR, plain, newNodeKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	verificationToken, err := d.computeVerificationToken(contentKeyPacket, newNodeKR, encryptedBlock, content)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	sha256Digest := sha256.Sum256(encryptedBlock)
	sha1Digest := sha1.Sum(content)
	modTime := options.ModTime
	if modTime.IsZero() {
		modTime = time.Now().UTC()
	}
	xAttrCommon := &revisionXAttrCommon{
		ModificationTime: modTime.Format("2006-01-02T15:04:05-0700"),
		Size:             int64(len(content)),
		BlockSizes:       []int64{int64(len(content))},
		Digests: map[string]string{
			"SHA1": hex.EncodeToString(sha1Digest[:]),
		},
	}
	manifestSignatureData := sha256Digest[:]
	manifestSignature, err := d.state.defaultAddrKR.SignDetached(crypto.NewPlainMessage(manifestSignatureData))
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	manifestSignatureString, err := manifestSignature.GetArmored()
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	commitReq := commitRevisionReq{ManifestSignature: manifestSignatureString, SignatureAddress: d.signatureAddress()}
	if err := commitReq.setEncXAttrString(d.state.defaultAddrKR, newNodeKR, xAttrCommon); err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	resp, err := d.uploadSmallFile(ctx, smallFileMetadata{
		ParentLinkID:                  parent.LinkID,
		Name:                          mustEncryptArmored(parentKR, []byte(name)),
		NameHash:                      getNameHash(name, parentHashKey),
		NodePassphrase:                newNodePassphraseEnc,
		NodePassphraseSignature:       newNodePassphraseSignature,
		SignatureEmail:                d.signatureAddress(),
		NodeKey:                       newNodeKey,
		MIMEType:                      mimeType,
		ContentKeyPacket:              contentKeyPacket,
		ContentKeyPacketSignature:     contentKeyPacketSignature,
		ManifestSignature:             commitReq.ManifestSignature,
		ContentBlockEncSignature:      armoredBlockSignature,
		ContentBlockVerificationToken: base64.StdEncoding.EncodeToString(verificationToken),
		XAttr:                         commitReq.XAttr,
		Photo:                         nil,
	}, encryptedBlock)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	d.ClearCache()
	node := Node{ID: resp.LinkID, ParentID: parentID, Name: name, Type: NodeTypeFile, Size: int64(len(content)), MIMEType: mimeType, ModTime: modTime, CreateTime: time.Now().UTC(), OriginalSHA1: hex.EncodeToString(sha1Digest[:])}
	attrs := RevisionAttrs{Size: int64(len(content)), ModTime: modTime, Digests: map[string]string{"SHA1": hex.EncodeToString(sha1Digest[:])}, BlockSizes: []int64{int64(len(content))}, EncryptedSize: int64(len(content))}
	return node, attrs, nil
}

func (d *standaloneDriver) computeVerificationToken(base64ContentKeyPacket string, nodeKR *crypto.KeyRing, encryptedBlock []byte, plainData []byte) ([]byte, error) {
	contentKeyPacket, err := base64.StdEncoding.DecodeString(base64ContentKeyPacket)
	if err != nil {
		return nil, err
	}
	sessionKey, err := nodeKR.DecryptSessionKey(contentKeyPacket)
	if err != nil {
		return nil, err
	}
	decrypted, err := sessionKey.Decrypt(encryptedBlock)
	if err != nil {
		return nil, err
	}
	plainPrefix := plainData
	if len(plainPrefix) > 16 {
		plainPrefix = plainPrefix[:16]
	}
	decryptedPrefix, err := io.ReadAll(io.LimitReader(decrypted.NewReader(), int64(len(plainPrefix))))
	if err != nil {
		return nil, err
	}
	if !bytes.Equal(decryptedPrefix, plainPrefix) {
		return nil, fmt.Errorf("session key and encrypted block mismatch during verification")
	}
	verificationToken := make([]byte, 32)
	for i := range verificationToken {
		var b byte
		if i < len(encryptedBlock) {
			b = encryptedBlock[i]
		}
		verificationToken[i] = contentKeyPacket[len(contentKeyPacket)-32+i] ^ b
	}
	return verificationToken, nil
}

func signEncryptedBlock(signingKR *crypto.KeyRing, plain *crypto.PlainMessage, nodeKR *crypto.KeyRing) (string, error) {
	encSignature, err := signingKR.SignDetachedEncrypted(plain, nodeKR)
	if err != nil {
		return "", err
	}
	return encSignature.GetArmored()
}

func (d *standaloneDriver) createFileUploadDraft(ctx context.Context, parent proton.Link, filename, mimeType string) (string, string, *crypto.SessionKey, *crypto.KeyRing, error) {
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return "", "", nil, nil, err
	}
	newNodeKey, newNodePassphraseEnc, newNodePassphraseSignature, newNodeKR, err := d.generateNodeMaterial(parentKR)
	if err != nil {
		return "", "", nil, nil, err
	}
	parentHashKey, err := parent.GetHashKey(parentKR)
	if err != nil {
		return "", "", nil, nil, err
	}
	contentSessionKey, contentKeyPacket, contentKeyPacketSignature, err := createContentKeyPacketAndSignature(newNodeKR)
	if err != nil {
		return "", "", nil, nil, err
	}
	req := proton.CreateFileReq{
		ParentLinkID:              parent.LinkID,
		Name:                      mustEncryptArmored(parentKR, []byte(filename)),
		Hash:                      getNameHash(filename, parentHashKey),
		MIMEType:                  mimeType,
		ContentKeyPacket:          contentKeyPacket,
		ContentKeyPacketSignature: contentKeyPacketSignature,
		NodeKey:                   newNodeKey,
		NodePassphrase:            newNodePassphraseEnc,
		NodePassphraseSignature:   newNodePassphraseSignature,
		SignatureAddress:          d.signatureAddress(),
	}
	createFileResp, err := d.client.CreateFile(ctx, d.state.mainShare.ShareID, req)
	if err != nil {
		return "", "", nil, nil, err
	}
	return createFileResp.ID, createFileResp.RevisionID, contentSessionKey, newNodeKR, nil
}

func (d *standaloneDriver) uploadAndCollectBlockData(ctx context.Context, sessionKey *crypto.SessionKey, nodeKR *crypto.KeyRing, file io.Reader, linkID, revisionID string) ([]byte, int64, []int64, string, []proton.BlockToken, error) {
	const uploadBlockSize = 4 * 1024 * 1024
	type pendingUploadBlock struct {
		info    proton.BlockUploadInfo
		encData []byte
	}
	totalFileSize := int64(0)
	manifestSignatureData := make([]byte, 0)
	pending := make([]pendingUploadBlock, 0)
	sha1Digests := sha1.New()
	blockSizes := make([]int64, 0)
	tokens := make([]proton.BlockToken, 0)
	for index := 1; ; index++ {
		data := make([]byte, uploadBlockSize)
		readBytes, err := io.ReadFull(file, data)
		if err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				if readBytes == 0 {
					break
				}
				data = data[:readBytes]
			} else {
				return nil, 0, nil, "", nil, err
			}
		} else {
			data = data[:readBytes]
		}
		totalFileSize += int64(len(data))
		sha1Digests.Write(data)
		blockSizes = append(blockSizes, int64(len(data)))
		plain := crypto.NewPlainMessage(data)
		encData, err := sessionKey.Encrypt(plain)
		if err != nil {
			return nil, 0, nil, "", nil, err
		}
		encSignature, err := d.state.defaultAddrKR.SignDetachedEncrypted(plain, nodeKR)
		if err != nil {
			return nil, 0, nil, "", nil, err
		}
		encSignatureStr, err := encSignature.GetArmored()
		if err != nil {
			return nil, 0, nil, "", nil, err
		}
		h := sha256.New()
		h.Write(encData)
		hash := h.Sum(nil)
		manifestSignatureData = append(manifestSignatureData, hash...)
		pending = append(pending, pendingUploadBlock{info: proton.BlockUploadInfo{Index: index, Size: int64(len(encData)), EncSignature: encSignatureStr, Hash: base64.StdEncoding.EncodeToString(hash)}, encData: encData})
	}
	if len(pending) == 0 {
		return nil, 0, nil, "", nil, nil
	}
	blockUploadReq := proton.BlockUploadReq{AddressID: d.state.mainShare.AddressID, ShareID: d.state.mainShare.ShareID, LinkID: linkID, RevisionID: revisionID, BlockList: make([]proton.BlockUploadInfo, 0, len(pending))}
	for _, item := range pending {
		blockUploadReq.BlockList = append(blockUploadReq.BlockList, item.info)
	}
	blockUploadResp, err := d.client.RequestBlockUpload(ctx, blockUploadReq)
	if err != nil {
		return nil, 0, nil, "", nil, err
	}
	for i := range blockUploadResp {
		if err := d.client.UploadBlock(ctx, blockUploadResp[i].BareURL, blockUploadResp[i].Token, byteMultipartStream(pending[i].encData)); err != nil {
			return nil, 0, nil, "", nil, err
		}
		tokens = append(tokens, proton.BlockToken{Index: pending[i].info.Index, Token: blockUploadResp[i].Token})
	}
	return manifestSignatureData, totalFileSize, blockSizes, hex.EncodeToString(sha1Digests.Sum(nil)), tokens, nil
}

func (d *standaloneDriver) commitNewRevision(ctx context.Context, nodeKR *crypto.KeyRing, xAttrCommon *revisionXAttrCommon, manifestSignatureData []byte, linkID, revisionID string, blockTokens []proton.BlockToken) error {
	manifestSignature, err := d.state.defaultAddrKR.SignDetached(crypto.NewPlainMessage(manifestSignatureData))
	if err != nil {
		return err
	}
	manifestSignatureString, err := manifestSignature.GetArmored()
	if err != nil {
		return err
	}
	_ = nodeKR
	_ = xAttrCommon
	return d.client.UpdateRevision(ctx, d.state.mainShare.ShareID, linkID, revisionID, proton.UpdateRevisionReq{BlockList: blockTokens, State: proton.RevisionStateActive, ManifestSignature: manifestSignatureString, SignatureAddress: d.signatureAddress()})
}
