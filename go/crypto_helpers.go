package protondrive

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
	"github.com/ProtonMail/gopenpgp/v2/helper"
)

// generatePassphrase creates a random 32-byte passphrase, base64-encoded.
func generatePassphrase() (string, error) {
	token, err := crypto.RandomToken(32)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(token), nil
}

// generateSessionKey creates a fresh AES session key for content encryption.
func generateSessionKey() (*crypto.SessionKey, error) {
	return crypto.GenerateSessionKey()
}

// generateCryptoKey creates a new PGP key pair. Returns the passphrase and
// ASCII-armored private key.
func generateCryptoKey() (passphrase, armoredKey string, err error) {
	passphrase, err = generatePassphrase()
	if err != nil {
		return
	}
	armoredKey, err = helper.GenerateKey("Drive key", "noreply@protonmail.com", []byte(passphrase), "x25519", 0)
	return
}

// encryptWithSignature encrypts data to the given keyring and produces a
// detached signature using the address keyring. Returns armored ciphertext
// and armored signature.
func encryptWithSignature(kr, addrKR *crypto.KeyRing, data []byte) (encArmored, sigArmored string, err error) {
	enc, err := kr.Encrypt(crypto.NewPlainMessage(data), nil)
	if err != nil {
		return
	}
	encArmored, err = enc.GetArmored()
	if err != nil {
		return
	}
	sig, err := addrKR.SignDetached(crypto.NewPlainMessage(data))
	if err != nil {
		return
	}
	sigArmored, err = sig.GetArmored()
	return
}

// decryptAndVerifyPassphrase decrypts an armored passphrase using the parent
// keyring and verifies the signature against the address keyring. Returns the
// decrypted passphrase bytes.
func decryptAndVerifyPassphrase(kr, addrKR *crypto.KeyRing, armoredPassphrase, armoredSignature string) ([]byte, error) {
	enc, err := crypto.NewPGPMessageFromArmored(armoredPassphrase)
	if err != nil {
		return nil, err
	}
	dec, err := kr.Decrypt(enc, nil, crypto.GetUnixTime())
	if err != nil {
		return nil, err
	}
	sig, err := crypto.NewPGPSignatureFromArmored(armoredSignature)
	if err != nil {
		return nil, err
	}
	if err := addrKR.VerifyDetached(dec, sig, crypto.GetUnixTime()); err != nil {
		return nil, err
	}
	return dec.GetBinary(), nil
}

// unlockKeyAndCreateKeyRing decrypts an armored PGP key using the given
// passphrase and builds a keyring from it.
func unlockKeyAndCreateKeyRing(armoredKey string, passphrase []byte) (*crypto.KeyRing, error) {
	lockedKey, err := crypto.NewKeyFromArmored(armoredKey)
	if err != nil {
		return nil, err
	}
	unlockedKey, err := lockedKey.Unlock(passphrase)
	if err != nil {
		return nil, err
	}
	return crypto.NewKeyRing(unlockedKey)
}

// getKeyRing decrypts a node key by first decrypting and verifying the
// passphrase, then unlocking the armored key. This was previously named
// getKeyRing with inline passphrase decryption.
func getKeyRing(parentKR, addrKR *crypto.KeyRing, armoredKey, armoredPassphrase, armoredSignature string) (*crypto.KeyRing, error) {
	passphrase, err := decryptAndVerifyPassphrase(parentKR, addrKR, armoredPassphrase, armoredSignature)
	if err != nil {
		return nil, fmt.Errorf("decrypt node passphrase: %w", err)
	}
	return unlockKeyAndCreateKeyRing(armoredKey, passphrase)
}

// mustEncryptArmored encrypts data to the keyring and returns the armored
// ciphertext. Panics on failure — used only for operations where a crypto
// error indicates a corrupted driver state.
func mustEncryptArmored(kr *crypto.KeyRing, data []byte) string {
	enc, err := kr.Encrypt(crypto.NewPlainMessage(data), nil)
	if err != nil {
		panic(err)
	}
	armored, err := enc.GetArmored()
	if err != nil {
		panic(err)
	}
	return armored
}

// encryptNodeHashKey generates a random hash key and encrypts it to the node
// keyring. The hash key is used for HMAC-based name hashing.
func encryptNodeHashKey(nodeKR *crypto.KeyRing) (string, error) {
	token, err := crypto.RandomToken(32)
	if err != nil {
		return "", err
	}
	enc, err := nodeKR.Encrypt(crypto.NewPlainMessage(token), nodeKR)
	if err != nil {
		return "", err
	}
	return enc.GetArmored()
}

// getNameHash computes the HMAC-SHA256 of a node name using the parent's hash
// key. This hash is sent to the server to support deterministic child lookups.
func getNameHash(name string, hashKey []byte) string {
	h := hmac.New(sha256.New, hashKey)
	_, _ = h.Write([]byte(name))
	return hex.EncodeToString(h.Sum(nil))
}

// decryptLinkName decrypts a link's encrypted name. Falls back to manual
// decryption if the upstream helper fails (some accounts lack name signatures).
func decryptLinkName(link proton.Link, parentKR, verificationKR *crypto.KeyRing) (string, error) {
	name, err := link.GetName(parentKR, verificationKR)
	if err == nil {
		return name, nil
	}
	encName, parseErr := crypto.NewPGPMessageFromArmored(link.Name)
	if parseErr != nil {
		return "", fmt.Errorf("parse encrypted name: %w", parseErr)
	}
	decName, decryptErr := parentKR.Decrypt(encName, nil, crypto.GetUnixTime())
	if decryptErr != nil {
		return "", fmt.Errorf("decrypt name: %w", decryptErr)
	}
	return decName.GetString(), nil
}

// getEncryptedName encrypts a node name to the node keyring with a signature
// from the address keyring.
func getEncryptedName(name string, addrKR, nodeKR *crypto.KeyRing) (string, error) {
	encName, err := nodeKR.Encrypt(crypto.NewPlainMessageFromString(name), addrKR)
	if err != nil {
		return "", err
	}
	return encName.GetArmored()
}

// createContentKeyPacketAndSignature generates a fresh session key for file
// content, encrypts it to the node keyring, and signs the raw session key
// bytes. Returns the session key, base64-encoded encrypted key packet, and
// armored signature.
func createContentKeyPacketAndSignature(nodeKR *crypto.KeyRing) (sessionKey *crypto.SessionKey, keyPacketB64, armoredSig string, err error) {
	sessionKey, err = crypto.GenerateSessionKey()
	if err != nil {
		return
	}
	encKey, err := nodeKR.EncryptSessionKey(sessionKey)
	if err != nil {
		return
	}
	sig, err := nodeKR.SignDetached(crypto.NewPlainMessage(sessionKey.Key))
	if err != nil {
		return
	}
	armoredSig, err = sig.GetArmored()
	if err != nil {
		return
	}
	keyPacketB64 = base64.StdEncoding.EncodeToString(encKey)
	return
}

// nodeFromLink constructs a public Node from an internal proton.Link and its
// decrypted name.
func nodeFromLink(link proton.Link, name string) Node {
	nodeType := NodeTypeFile
	if link.Type == proton.LinkTypeFolder {
		nodeType = NodeTypeFolder
	}
	return Node{
		ID:         link.LinkID,
		ParentID:   link.ParentLinkID,
		Name:       name,
		Type:       nodeType,
		Size:       link.Size,
		MIMEType:   link.MIMEType,
		ModTime:    time.Unix(link.ModifyTime, 0),
		CreateTime: time.Unix(link.CreateTime, 0),
	}
}
