package protondrive

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestNewClientValidatesRequiredFields(t *testing.T) {
	_, err := NewClient(context.Background(), &FakeDialer{}, LoginOptions{}, SessionHooks{})
	if !errors.Is(err, ErrInvalidLogin) {
		t.Fatalf("expected ErrInvalidLogin, got %v", err)
	}
}

func TestNewClientWithSessionValidatesSession(t *testing.T) {
	_, err := NewClientWithSession(context.Background(), &FakeDialer{}, ResumeOptions{AppVersion: "external-drive-rclone@1.0.0"}, SessionHooks{})
	if !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession, got %v", err)
	}
}

func TestNewClientEmitsSessionFromDialer(t *testing.T) {
	expected := Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"}
	var got Session
	client, err := NewClient(
		context.Background(),
		&FakeDialer{LoginDriver: &FakeDriver{SessionValue: expected}},
		LoginOptions{Username: "user", Password: "pass", AppVersion: "external-drive-rclone@1.0.0"},
		SessionHooks{OnSession: func(session Session) { got = session }},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client.Session() != expected {
		t.Fatalf("unexpected session: %#v", client.Session())
	}
	if got != expected {
		t.Fatalf("expected session hook %#v, got %#v", expected, got)
	}
}

func TestUploadRejectsUnknownSize(t *testing.T) {
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, _, err = client.UploadFile(context.Background(), "parent", "name", strings.NewReader("hello"), UploadOptions{KnownSize: -1})
	if !errors.Is(err, ErrUnknownSizeUpload) {
		t.Fatalf("expected ErrUnknownSizeUpload, got %v", err)
	}
}

func TestLogoutEmitsDeauth(t *testing.T) {
	called := false
	client, err := NewClientFromDriver(&FakeDriver{}, SessionHooks{OnDeauth: func() { called = true }})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := client.Logout(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Fatal("expected deauth hook to be called")
	}
}

func TestSessionValidity(t *testing.T) {
	if (Session{}).Valid() {
		t.Fatal("empty session should be invalid")
	}
	if !(&FakeDriver{SessionValue: Session{UID: "uid", AccessToken: "access", RefreshToken: "refresh", SaltedKeyPass: "salted"}}).Session().Valid() {
		t.Fatal("expected session to be valid")
	}
}

func TestNewDialerCreatesStandaloneDriver(t *testing.T) {
	client, err := NewClient(context.Background(), &FakeDialer{LoginDriver: &FakeDriver{SessionValue: Session{
		UID: "user",
	}}}, LoginOptions{
		Username:   "user",
		Password:   "pass",
		AppVersion: "external-drive-rclone@1.0.0",
	}, SessionHooks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client.Session().UID != "user" {
		t.Fatalf("expected fake driver session, got %#v", client.Session())
	}
	if _, err := client.About(context.Background()); err != nil {
		t.Fatalf("expected fake driver to return zero usage without error, got %v", err)
	}
}
