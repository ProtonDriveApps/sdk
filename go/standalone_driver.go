package protondrive

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"sync"
	"time"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
	"github.com/ProtonMail/gopenpgp/v2/helper"
)

type driveState struct {
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
	manager *proton.Manager
	client  *proton.Client
	hooks   SessionHooks
	session Session
	state   *driveState
}

type standaloneDriver struct {
	mu      sync.RWMutex
	manager *proton.Manager
	client  *proton.Client
	session Session
	hooks   SessionHooks
	cache   map[string]Node
	rootID  string
	state   *driveState
}

func newStandaloneDriver(config standaloneDriverConfig) *standaloneDriver {
	driver := &standaloneDriver{
		manager: config.manager,
		client:  config.client,
		session: config.session,
		hooks:   config.hooks,
		cache:   make(map[string]Node),
		rootID:  "root",
		state:   config.state,
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
	for _, volume := range volumes {
		if volume.State == proton.VolumeStateActive {
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
