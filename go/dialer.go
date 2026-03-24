package protondrive

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"runtime/debug"
	"strings"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/go-srp"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
)

// NewDialer returns a Dialer that creates standalone Driver instances backed
// by the official Proton Mail Go client library.
func NewDialer() Dialer {
	return &dialer{}
}

type dialer struct{}

// Login performs SRP authentication with Proton, handles optional TOTP
// two-factor verification, unlocks the account keyring, and returns a ready
// Driver. Panics from the upstream library are caught and returned as errors.
func (d *dialer) Login(ctx context.Context, options LoginOptions, hooks SessionHooks) (_ Driver, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("proton login bootstrap panicked: %v\n%s", recovered, debug.Stack())
		}
	}()
	options.Username = strings.TrimSpace(options.Username)
	options.Password = strings.TrimSpace(options.Password)
	options.MailboxPassword = strings.TrimSpace(options.MailboxPassword)
	options.TwoFactorCode = strings.TrimSpace(options.TwoFactorCode)
	options.AppVersion = strings.TrimSpace(options.AppVersion)

	manager := newManager(options.BaseURL, options.AppVersion)
	auth, err := loginWithSRP(ctx, options)
	if err != nil {
		manager.Close()
		return nil, err
	}
	client := manager.NewClient(auth.UID, auth.AccessToken, auth.RefreshToken)

	if auth.TwoFA.Enabled&proton.HasTOTP != 0 {
		totpCode := strings.TrimSpace(options.TwoFactorCode)
		if strings.TrimSpace(options.TOTPSecret) != "" {
			totpCode, err = generateTOTP(options.TOTPSecret)
			if err != nil {
				client.Close()
				manager.Close()
				return nil, fmt.Errorf("generate TOTP: %w", err)
			}
		}
		if totpCode == "" {
			client.Close()
			manager.Close()
			return nil, fmt.Errorf("two-factor code is required")
		}
		if err := client.Auth2FA(ctx, proton.Auth2FAReq{TwoFactorCode: totpCode}); err != nil {
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

	state, err := bootstrapDriveStateFromPassword(ctx, client, keyPass)
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
		manager:    manager,
		client:     client,
		baseURL:    options.BaseURL,
		appVersion: options.AppVersion,
		userAgent:  options.UserAgent,
		httpClient: options.HTTPClient,
		hooks:      hooks,
		session:    session,
		state:      state,
	})
	attachSessionHooks(client, driver, hooks)
	hooks.emitSession(session)
	return driver, nil
}

// Resume reconnects to Proton using a previously persisted session (refresh
// token + salted key passphrase), avoiding re-entering the password.
func (d *dialer) Resume(ctx context.Context, options ResumeOptions, hooks SessionHooks) (_ Driver, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("proton session resume panicked: %v\n%s", recovered, debug.Stack())
		}
	}()
	options.Session.UID = strings.TrimSpace(options.Session.UID)
	options.Session.AccessToken = strings.TrimSpace(options.Session.AccessToken)
	options.Session.RefreshToken = strings.TrimSpace(options.Session.RefreshToken)
	options.Session.SaltedKeyPass = strings.TrimSpace(options.Session.SaltedKeyPass)
	options.AppVersion = strings.TrimSpace(options.AppVersion)

	manager := newManager(options.BaseURL, options.AppVersion)
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

	state, err := bootstrapDriveStateFromSaltedPass(ctx, client, saltedKeyPass)
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
		manager:    manager,
		client:     client,
		baseURL:    options.BaseURL,
		appVersion: options.AppVersion,
		userAgent:  options.UserAgent,
		httpClient: options.HTTPClient,
		hooks:      hooks,
		session:    session,
		state:      state,
	})
	attachSessionHooks(client, driver, hooks)
	hooks.emitSession(session)
	return driver, nil
}

// newManager creates a proton.Manager with the given base URL and app version.
func newManager(baseURL, appVersion string) *proton.Manager {
	options := []proton.Option{proton.WithAppVersion(appVersion)}
	if strings.TrimSpace(baseURL) != "" {
		options = append(options, proton.WithHostURL(ensureAPIBaseURL(baseURL)))
	}
	return proton.New(options...)
}

// authInfoResponse is the raw JSON response from POST /auth/v4/info.
type authInfoResponse struct {
	Code            int              `json:"Code"`
	Error           string           `json:"Error"`
	Version         int              `json:"Version"`
	Modulus         string           `json:"Modulus"`
	ServerEphemeral string           `json:"ServerEphemeral"`
	Salt            string           `json:"Salt"`
	SRPSession      string           `json:"SRPSession"`
	TwoFA           proton.TwoFAInfo `json:"2FA"`
}

// authResponse is the raw JSON response from POST /auth/v4.
type authResponse struct {
	Code         int                 `json:"Code"`
	Error        string              `json:"Error"`
	UID          string              `json:"UID"`
	AccessToken  string              `json:"AccessToken"`
	RefreshToken string              `json:"RefreshToken"`
	ServerProof  string              `json:"ServerProof"`
	PasswordMode proton.PasswordMode `json:"PasswordMode"`
	TwoFA        proton.TwoFAInfo    `json:"2FA"`
}

// loginWithSRP performs the SRP authentication handshake directly against the
// Proton API, bypassing the upstream NewClientWithLogin helper which panics in
// this environment. It fetches SRP parameters, generates client proofs,
// performs the auth exchange, and verifies the server's proof.
func loginWithSRP(ctx context.Context, options LoginOptions) (proton.Auth, error) {
	info, err := fetchAuthInfo(ctx, options)
	if err != nil {
		return proton.Auth{}, err
	}
	srpAuth, err := srp.NewAuth(info.Version, options.Username, []byte(options.Password), info.Salt, info.Modulus, info.ServerEphemeral)
	if err != nil {
		return proton.Auth{}, err
	}
	proofs, err := srpAuth.GenerateProofs(2048)
	if err != nil {
		return proton.Auth{}, err
	}
	auth, err := performAuth(ctx, options, info.SRPSession, proofs)
	if err != nil {
		return proton.Auth{}, err
	}
	serverProof, err := base64.StdEncoding.DecodeString(auth.ServerProof)
	if err != nil {
		return proton.Auth{}, err
	}
	if !bytes.Equal(serverProof, proofs.ExpectedServerProof) {
		return proton.Auth{}, proton.ErrInvalidProof
	}
	return proton.Auth{
		UID:          auth.UID,
		AccessToken:  auth.AccessToken,
		RefreshToken: auth.RefreshToken,
		ServerProof:  auth.ServerProof,
		PasswordMode: auth.PasswordMode,
		TwoFA:        auth.TwoFA,
	}, nil
}

// fetchAuthInfo calls POST /auth/v4/info to retrieve the SRP parameters
// (modulus, server ephemeral, salt) needed for password verification.
func fetchAuthInfo(ctx context.Context, options LoginOptions) (authInfoResponse, error) {
	var out authInfoResponse
	payload, err := json.Marshal(map[string]string{"Username": options.Username})
	if err != nil {
		return out, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ensureAPIBaseURL(options.BaseURL)+"/auth/v4/info", bytes.NewReader(payload))
	if err != nil {
		return out, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-pm-appversion", options.AppVersion)
	if options.UserAgent != "" {
		req.Header.Set("User-Agent", options.UserAgent)
	}
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return out, err
	}
	defer resp.Body.Close() //nolint:errcheck // best-effort close on response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return out, fmt.Errorf("read auth info response: %w", err)
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return out, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || out.Code != 1000 {
		if out.Error == "" {
			out.Error = strings.TrimSpace(string(body))
		}
		return out, fmt.Errorf("auth info failed: %s", out.Error)
	}
	return out, nil
}

// performAuth calls POST /auth/v4 with the SRP client proof and ephemeral
// to complete the authentication exchange.
func performAuth(ctx context.Context, options LoginOptions, srpSession string, proofs *srp.Proofs) (authResponse, error) {
	var out authResponse
	payload, err := json.Marshal(map[string]string{
		"Username":        options.Username,
		"ClientProof":     base64.StdEncoding.EncodeToString(proofs.ClientProof),
		"ClientEphemeral": base64.StdEncoding.EncodeToString(proofs.ClientEphemeral),
		"SRPSession":      srpSession,
	})
	if err != nil {
		return out, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ensureAPIBaseURL(options.BaseURL)+"/auth/v4", bytes.NewReader(payload))
	if err != nil {
		return out, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-pm-appversion", options.AppVersion)
	if options.UserAgent != "" {
		req.Header.Set("User-Agent", options.UserAgent)
	}
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return out, err
	}
	defer resp.Body.Close() //nolint:errcheck // best-effort close on response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return out, fmt.Errorf("read auth response: %w", err)
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return out, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || (out.Code != 1000 && out.Code != 1001) {
		if out.Error == "" {
			out.Error = strings.TrimSpace(string(body))
		}
		return out, fmt.Errorf("auth failed: %s", out.Error)
	}
	return out, nil
}

// ensureAPIBaseURL normalizes a base URL to include the /api suffix. If
// baseURL is empty, it returns the production default.
func ensureAPIBaseURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "https://mail.proton.me/api"
	}
	if strings.HasSuffix(trimmed, "/api") {
		return trimmed
	}
	return trimmed + "/api"
}

// attachSessionHooks wires the Proton client's auth/deauth handlers to update
// the driver's session state and emit hooks to the consumer.
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

// bootstrapDriveStateFromPassword derives the salted key passphrase from the
// raw password, then bootstraps the full drive state.
func bootstrapDriveStateFromPassword(ctx context.Context, client *proton.Client, keyPass []byte) (*driveState, error) {
	user, addresses, userKR, addrKRs, saltedKeyPass, err := unlockAccount(ctx, client, keyPass, nil)
	if err != nil {
		return nil, err
	}
	return bootstrapDriveState(ctx, client, user, addresses, userKR, addrKRs, saltedKeyPass)
}

// bootstrapDriveStateFromSaltedPass uses a previously cached salted key
// passphrase to unlock the account and bootstrap the drive state.
func bootstrapDriveStateFromSaltedPass(ctx context.Context, client *proton.Client, saltedKeyPass []byte) (*driveState, error) {
	user, addresses, userKR, addrKRs, _, err := unlockAccount(ctx, client, nil, saltedKeyPass)
	if err != nil {
		return nil, err
	}
	return bootstrapDriveState(ctx, client, user, addresses, userKR, addrKRs, saltedKeyPass)
}

// unlockAccount fetches the user profile and addresses, optionally derives the
// salted key passphrase from the raw password, and unlocks all PGP keyrings.
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
		userKey, err := primaryOrFirstKey(user.Keys)
		if err != nil {
			return proton.User{}, nil, nil, nil, nil, err
		}
		salts, err := client.GetSalts(ctx)
		if err != nil {
			return proton.User{}, nil, nil, nil, nil, err
		}
		saltedKeyPass, err = salts.SaltForKey(keyPass, userKey.ID)
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

// primaryOrFirstKey returns the primary key from a set, falling back to the
// first key if none is marked primary. This guards against accounts where
// Keys.Primary() might not be set correctly.
func primaryOrFirstKey(keys proton.Keys) (proton.Key, error) {
	for _, key := range keys {
		if key.Primary {
			return key, nil
		}
	}
	if len(keys) > 0 {
		return keys[0], nil
	}
	return proton.Key{}, fmt.Errorf("no user key available for account bootstrap")
}
