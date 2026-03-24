package protondrive

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const DefaultIntegrationConfigPath = "integration/protondrive.test.json"

type IntegrationConfig struct {
	Username        string `json:"username"`
	Password        string `json:"password"`
	MailboxPassword string `json:"mailbox_password"`
	TwoFactorCode   string `json:"two_factor_code"`
	AppVersion      string `json:"app_version"`
	UserAgent       string `json:"user_agent"`
	EnableCaching   bool   `json:"enable_caching"`
	ReplaceDrafts   bool   `json:"replace_existing_draft"`
	ExpectedRootID  string `json:"expected_root_id"`
	TestFolderID    string `json:"test_folder_id"`
	TestFileID      string `json:"test_file_id"`
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
		Username:        c.Username,
		Password:        c.Password,
		MailboxPassword: c.MailboxPassword,
		TwoFactorCode:   c.TwoFactorCode,
		AppVersion:      c.AppVersion,
		UserAgent:       c.UserAgent,
		EnableCaching:   c.EnableCaching,
	}
}
