package protondrive

import (
	"context"
	"encoding/base64"
	"fmt"

	"github.com/ProtonMail/gopenpgp/v2/crypto"
	proton "github.com/rclone/go-proton-api"
)

func NewDialer() Dialer {
	return &dialer{}
}

type dialer struct{}

func (d *dialer) Login(ctx context.Context, options LoginOptions, hooks SessionHooks) (Driver, error) {
	manager := newManager(options.AppVersion, options.UserAgent)
	client, auth, err := manager.NewClientWithLogin(ctx, options.Username, []byte(options.Password))
	if err != nil {
		manager.Close()
		return nil, err
	}

	if auth.TwoFA.Enabled&proton.HasTOTP != 0 {
		if options.TwoFactorCode == "" {
			client.Close()
			manager.Close()
			return nil, fmt.Errorf("two-factor code is required")
		}
		if err := client.Auth2FA(ctx, proton.Auth2FAReq{TwoFactorCode: options.TwoFactorCode}); err != nil {
			client.Close()
			manager.Close()
			return nil, err
		}
	}

	keyPass := []byte(options.Password)
	if auth.PasswordMode == proton.TwoPasswordMode {
		if options.MailboxPassword == "" {
			client.Close()
			manager.Close()
			return nil, fmt.Errorf("mailbox password is required")
		}
		keyPass = []byte(options.MailboxPassword)
	}

	state, err := bootstrapDriveStateFromPassword(ctx, manager, client, keyPass)
	if err != nil {
		client.Close()
		manager.Close()
		return nil, err
	}

	session := Session{
		UID:           auth.UID,
		AccessToken:   auth.AccessToken,
		RefreshToken:  auth.RefreshToken,
		SaltedKeyPass: base64.StdEncoding.EncodeToString(state.saltedKeyPass),
	}

	driver := newStandaloneDriver(standaloneDriverConfig{
		manager: manager,
		client:  client,
		hooks:   hooks,
		session: session,
		state:   state,
	})
	attachSessionHooks(client, driver, hooks)
	hooks.emitSession(session)
	return driver, nil
}

func (d *dialer) Resume(ctx context.Context, options ResumeOptions, hooks SessionHooks) (Driver, error) {
	manager := newManager(options.AppVersion, options.UserAgent)
	client, auth, err := manager.NewClientWithRefresh(ctx, options.Session.UID, options.Session.RefreshToken)
	if err != nil {
		manager.Close()
		return nil, err
	}

	saltedKeyPass, err := base64.StdEncoding.DecodeString(options.Session.SaltedKeyPass)
	if err != nil {
		client.Close()
		manager.Close()
		return nil, fmt.Errorf("decode salted key pass: %w", err)
	}

	state, err := bootstrapDriveStateFromSaltedPass(ctx, manager, client, saltedKeyPass)
	if err != nil {
		client.Close()
		manager.Close()
		return nil, err
	}

	session := Session{
		UID:           auth.UID,
		AccessToken:   auth.AccessToken,
		RefreshToken:  auth.RefreshToken,
		SaltedKeyPass: options.Session.SaltedKeyPass,
	}

	driver := newStandaloneDriver(standaloneDriverConfig{
		manager: manager,
		client:  client,
		hooks:   hooks,
		session: session,
		state:   state,
	})
	attachSessionHooks(client, driver, hooks)
	hooks.emitSession(session)
	return driver, nil
}

func newManager(appVersion, userAgent string) *proton.Manager {
	options := []proton.Option{proton.WithAppVersion(appVersion)}
	if userAgent != "" {
		options = append(options, proton.WithUserAgent(userAgent))
	}
	return proton.New(options...)
}

func attachSessionHooks(client *proton.Client, driver *standaloneDriver, hooks SessionHooks) {
	client.AddAuthHandler(func(auth proton.Auth) {
		driver.setSession(Session{
			UID:           auth.UID,
			AccessToken:   auth.AccessToken,
			RefreshToken:  auth.RefreshToken,
			SaltedKeyPass: driver.SaltedKeyPass(),
		})
		hooks.emitSession(driver.Session())
	})
	client.AddDeauthHandler(func() {
		driver.clearSession()
		hooks.emitDeauth()
	})
}

func bootstrapDriveStateFromPassword(ctx context.Context, manager *proton.Manager, client *proton.Client, keyPass []byte) (*driveState, error) {
	user, addresses, userKR, addrKRs, saltedKeyPass, err := unlockAccount(ctx, client, keyPass, nil)
	if err != nil {
		return nil, err
	}
	return bootstrapDriveState(ctx, manager, client, user, addresses, userKR, addrKRs, saltedKeyPass)
}

func bootstrapDriveStateFromSaltedPass(ctx context.Context, manager *proton.Manager, client *proton.Client, saltedKeyPass []byte) (*driveState, error) {
	user, addresses, userKR, addrKRs, _, err := unlockAccount(ctx, client, nil, saltedKeyPass)
	if err != nil {
		return nil, err
	}
	return bootstrapDriveState(ctx, manager, client, user, addresses, userKR, addrKRs, saltedKeyPass)
}

func unlockAccount(ctx context.Context, client *proton.Client, keyPass, saltedKeyPass []byte) (proton.User, []proton.Address, *crypto.KeyRing, map[string]*crypto.KeyRing, []byte, error) {
	user, err := client.GetUser(ctx)
	if err != nil {
		return proton.User{}, nil, nil, nil, nil, err
	}
	addresses, err := client.GetAddresses(ctx)
	if err != nil {
		return proton.User{}, nil, nil, nil, nil, err
	}
	if saltedKeyPass == nil {
		salts, err := client.GetSalts(ctx)
		if err != nil {
			return proton.User{}, nil, nil, nil, nil, err
		}
		saltedKeyPass, err = salts.SaltForKey(keyPass, user.Keys.Primary().ID)
		if err != nil {
			return proton.User{}, nil, nil, nil, nil, err
		}
	}
	userKR, addrKRs, err := proton.Unlock(user, addresses, saltedKeyPass, nil)
	if err != nil {
		return proton.User{}, nil, nil, nil, nil, err
	}
	return user, addresses, userKR, addrKRs, saltedKeyPass, nil
}
