package protondrive

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

// DefaultIntegrationConfigPath is the default filesystem path for the
// integration test credentials file.
const DefaultIntegrationConfigPath = "integration/protondrive.test.json"

// IntegrationConfig holds the credentials needed to run integration tests
// against a live Proton Drive account.
type IntegrationConfig struct {
	BaseURL         string `json:"base_url"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	MailboxPassword string `json:"mailbox_password"`
	TwoFactorCode   string `json:"two_factor_code"`
}

const (
	defaultIntegrationAppVersion = "web-drive@5.2.0"
	defaultIntegrationUserAgent  = "proton-drive-go-sdk-integration"
)

// LoadIntegrationConfig reads and parses the JSON credentials file at the
// given path. If path is empty, DefaultIntegrationConfigPath is used.
func LoadIntegrationConfig(path string) (IntegrationConfig, error) {
	if strings.TrimSpace(path) == "" {
		path = DefaultIntegrationConfigPath
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return IntegrationConfig{}, ErrMissingCredentialsFile
		}
		return IntegrationConfig{}, err
	}
	var config IntegrationConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return IntegrationConfig{}, fmt.Errorf("decode integration config: %w", err)
	}
	return config, nil
}

// LoginOptions converts the integration config into a LoginOptions value
// suitable for passing to NewClient. The config's two_factor_code field is
// treated as a TOTP secret and used to auto-generate the 2FA code.
func (c IntegrationConfig) LoginOptions() LoginOptions {
	return LoginOptions{
		BaseURL:         c.BaseURL,
		Username:        c.Username,
		Password:        c.Password,
		MailboxPassword: c.MailboxPassword,
		TOTPSecret:      c.TwoFactorCode,
		AppVersion:      defaultIntegrationAppVersion,
		UserAgent:       defaultIntegrationUserAgent,
	}
}

// Validate checks that all required credential fields are present.
func (c IntegrationConfig) Validate() error {
	if strings.TrimSpace(c.BaseURL) == "" {
		return errors.New("base_url is required")
	}
	if strings.TrimSpace(c.Username) == "" {
		return errors.New("username is required")
	}
	if strings.TrimSpace(c.Password) == "" {
		return errors.New("password is required")
	}
	return nil
}
