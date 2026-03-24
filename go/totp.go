package protondrive

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // TOTP (RFC 6238) requires HMAC-SHA1
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

// generateTOTP produces a 6-digit TOTP code from a base32-encoded secret
// using the current time (RFC 6238, period=30, digits=6, SHA1).
func generateTOTP(secret string) (string, error) {
	secret = strings.ToUpper(strings.TrimSpace(secret))
	secret = strings.TrimRight(secret, "=")
	key, err := base32.StdEncoding.DecodeString(secret)
	if err != nil {
		return "", fmt.Errorf("decode TOTP secret: %w", err)
	}
	counter := uint64(time.Now().Unix() / 30)
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0x0f
	code := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	otp := code % 1000000

	return fmt.Sprintf("%06d", otp), nil
}
