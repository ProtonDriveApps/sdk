package protondrive

import "strings"

// Session holds the reusable authentication state returned after a successful
// login. Consumers can persist these fields and later pass them to
// NewClientWithSession to resume without re-entering credentials.
type Session struct {
	UID           string
	AccessToken   string
	RefreshToken  string
	SaltedKeyPass string
}

// Valid reports whether every required session field is populated.
func (s Session) Valid() bool {
	return strings.TrimSpace(s.UID) != "" &&
		strings.TrimSpace(s.AccessToken) != "" &&
		strings.TrimSpace(s.RefreshToken) != "" &&
		strings.TrimSpace(s.SaltedKeyPass) != ""
}

// SessionHooks provides optional callbacks that fire on session creation and
// deauthentication, allowing consumers to persist or clear cached credentials.
type SessionHooks struct {
	OnSession func(Session)
	OnDeauth  func()
}

func (h SessionHooks) emitSession(session Session) {
	if h.OnSession != nil {
		h.OnSession(session)
	}
}

func (h SessionHooks) emitDeauth() {
	if h.OnDeauth != nil {
		h.OnDeauth()
	}
}
