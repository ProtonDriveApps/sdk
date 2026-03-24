package protondrive

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

const DefaultIntegrationConfigPath = "integration/protondrive.test.json"

type IntegrationConfig struct {
	BaseURL         string `json:"base_url"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	MailboxPassword string `json:"mailbox_password"`
	TwoFactorCode   string `json:"two_factor_code"`
	UID             string `json:"uid"`
	AccessToken     string `json:"access_token"`
	RefreshToken    string `json:"refresh_token"`
	SaltedKeyPass   string `json:"salted_key_pass"`
	AppVersion      string `json:"app_version"`
	UserAgent       string `json:"user_agent"`
	EnableCaching   bool   `json:"enable_caching"`
	ReplaceDrafts   bool   `json:"replace_existing_draft"`
	ExpectedRootID  string `json:"expected_root_id"`
	TestFolderID    string `json:"test_folder_id"`
	TestFileID      string `json:"test_file_id"`
}

func (c IntegrationConfig) ResumeOptions() ResumeOptions {
	return ResumeOptions{
		BaseURL: c.BaseURL,
		Session: Session{
			UID:           c.UID,
			AccessToken:   c.AccessToken,
			RefreshToken:  c.RefreshToken,
			SaltedKeyPass: c.SaltedKeyPass,
		},
		AppVersion:    c.AppVersion,
		UserAgent:     c.UserAgent,
		EnableCaching: c.EnableCaching,
	}
}

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

func (c IntegrationConfig) LoginOptions() LoginOptions {
	return LoginOptions{
		BaseURL:         c.BaseURL,
		Username:        c.Username,
		Password:        c.Password,
		MailboxPassword: c.MailboxPassword,
		TwoFactorCode:   c.TwoFactorCode,
		AppVersion:      c.AppVersion,
		UserAgent:       c.UserAgent,
		EnableCaching:   c.EnableCaching,
	}
}

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
	if strings.TrimSpace(c.AppVersion) == "" {
		return errors.New("app_version is required")
	}
	return nil
}

func (c IntegrationConfig) HasReusableSession() bool {
	return Session{
		UID:           c.UID,
		AccessToken:   c.AccessToken,
		RefreshToken:  c.RefreshToken,
		SaltedKeyPass: c.SaltedKeyPass,
	}.Valid()
}
