//go:build integration

package protondrive

import (
	"context"
	"errors"
	"testing"
)

func TestLoadIntegrationConfigMissingFile(t *testing.T) {
	_, err := LoadIntegrationConfig("integration/does-not-exist.json")
	if !errors.Is(err, ErrMissingCredentialsFile) {
		t.Fatalf("expected ErrMissingCredentialsFile, got %v", err)
	}
}

func TestIntegrationConfigProducesLoginOptions(t *testing.T) {
	config := IntegrationConfig{
		Username:      "user",
		Password:      "pass",
		AppVersion:    "external-drive-rclone@1.0.0",
		UserAgent:     "rclone/test",
		EnableCaching: true,
	}
	options := config.LoginOptions()
	if options.Username != config.Username || options.AppVersion != config.AppVersion || !options.EnableCaching {
		t.Fatalf("unexpected login options: %#v", options)
	}
}

func TestStandaloneIntegrationHarnessBootstrapsFromConfig(t *testing.T) {
	driver, err := NewDialer().Login(context.Background(), LoginOptions{
		Username:   "user",
		Password:   "pass",
		AppVersion: "external-drive-rclone@1.0.0",
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !driver.Session().Valid() {
		t.Fatalf("expected placeholder standalone session, got %#v", driver.Session())
	}
}
