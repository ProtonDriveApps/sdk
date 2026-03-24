//go:build protonbridge

package protondrive

import (
	"strings"
	"time"

	bridge "github.com/rclone/Proton-API-Bridge"
	bridgecommon "github.com/rclone/Proton-API-Bridge/common"
	proton "github.com/rclone/go-proton-api"
)

func applyCommonConfig(config *bridgecommon.Config, appVersion, userAgent string, enableCaching bool) {
	config.AppVersion = appVersion
	config.UserAgent = userAgent
	config.EnableCaching = enableCaching
	config.CredentialCacheFile = ""
}

func sessionFromCredential(credential *bridgecommon.ReusableCredentialData) Session {
	if credential == nil {
		return Session{}
	}
	return Session{
		UID:           credential.UID,
		AccessToken:   credential.AccessToken,
		RefreshToken:  credential.RefreshToken,
		SaltedKeyPass: credential.SaltedKeyPass,
	}
}

func sessionFromBridgeCredential(credential *bridgecommon.ProtonDriveCredential) Session {
	if credential == nil {
		return Session{}
	}
	return Session{
		UID:           credential.UID,
		AccessToken:   credential.AccessToken,
		RefreshToken:  credential.RefreshToken,
		SaltedKeyPass: credential.SaltedKeyPass,
	}
}

func sessionFromAuth(auth proton.Auth, saltedKeyPass string) Session {
	return Session{
		UID:           auth.UID,
		AccessToken:   auth.AccessToken,
		RefreshToken:  auth.RefreshToken,
		SaltedKeyPass: saltedKeyPass,
	}
}

func authHandler(hooks SessionHooks, saltedKeyPass func() string) proton.AuthHandler {
	return func(auth proton.Auth) {
		hooks.emitSession(sessionFromAuth(auth, saltedKeyPass()))
	}
}

func deauthHandler(hooks SessionHooks) proton.Handler {
	return func() {
		hooks.emitDeauth()
	}
}

func nodeFromLink(link *proton.Link, name string) Node {
	nodeType := NodeTypeFile
	if link.Type == proton.LinkTypeFolder {
		nodeType = NodeTypeFolder
	}
	return Node{
		ID:           link.LinkID,
		ParentID:     link.ParentLinkID,
		Name:         name,
		Type:         nodeType,
		Size:         link.Size,
		MIMEType:     link.MIMEType,
		ModTime:      time.Unix(link.ModifyTime, 0),
		CreateTime:   time.Unix(link.CreateTime, 0),
		OriginalSHA1: "",
	}
}

func revisionAttrsFromBridge(attrs *bridge.FileSystemAttrs, encryptedSize int64) RevisionAttrs {
	if attrs == nil {
		return RevisionAttrs{EncryptedSize: encryptedSize}
	}
	result := RevisionAttrs{
		Size:          attrs.Size,
		ModTime:       attrs.ModificationTime,
		BlockSizes:    append([]int64(nil), attrs.BlockSizes...),
		EncryptedSize: encryptedSize,
		Digests:       map[string]string{},
	}
	if strings.TrimSpace(attrs.Digests) != "" {
		result.Digests["SHA1"] = strings.ToLower(attrs.Digests)
	}
	return result
}

func revisionAttrsFromRevisionCommon(attrs *proton.RevisionXAttrCommon) RevisionAttrs {
	result := RevisionAttrs{
		Size:       attrs.Size,
		BlockSizes: append([]int64(nil), attrs.BlockSizes...),
		Digests:    map[string]string{},
	}
	for name, value := range attrs.Digests {
		result.Digests[strings.ToUpper(name)] = strings.ToLower(value)
	}
	if attrs.ModificationTime != "" {
		if parsed, err := time.Parse("2006-01-02T15:04:05-0700", attrs.ModificationTime); err == nil {
			result.ModTime = parsed
		}
	}
	return result
}

func fallbackMIMEType(value string) string {
	if strings.TrimSpace(value) == "" {
		return "application/octet-stream"
	}
	return value
}

func ptr[T any](value T) *T {
	return &value
}
