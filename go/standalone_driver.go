package protondrive

import (
	"context"
	"fmt"
	"io"
	"sync"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
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
