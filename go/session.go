package protondrive

import "strings"

type Session struct {
	UID           string
	AccessToken   string
	RefreshToken  string
	SaltedKeyPass string
}

func (s Session) Valid() bool {
	return strings.TrimSpace(s.UID) != "" &&
		strings.TrimSpace(s.AccessToken) != "" &&
		strings.TrimSpace(s.RefreshToken) != "" &&
		strings.TrimSpace(s.SaltedKeyPass) != ""
}

type SessionHandler interface {
	OnSession(session Session)
	OnDeauth()
}

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
