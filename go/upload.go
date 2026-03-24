package protondrive

import (
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"time"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
)

// uploadFile routes to either the small-file or large-file (v2 block) upload
// flow based on the declared size. Files <= 4 MiB use the small-file endpoint;
// larger files use the multi-block draft/revision API.
func (d *standaloneDriver) uploadFile(ctx context.Context, parentID, name string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	parent, err := d.getLink(ctx, parentID)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	mimeType := options.MediaType
	if mimeType == "" {
		mimeType = detectMIMEType(name)
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if options.KnownSize >= 0 && options.KnownSize <= 4*1024*1024 {
		return d.uploadSmallFileFlow(ctx, parent, parentID, name, mimeType, body, options)
	}
	return d.uploadLargeFileFlow(ctx, parent, parentID, name, mimeType, body, options)
}

// uploadSmallFileFlow reads the entire body into memory, encrypts it as a
// single block, and uploads via the v2 small-file endpoint. This path is used
// for files whose declared size is at most 4 MiB.
func (d *standaloneDriver) uploadSmallFileFlow(ctx context.Context, parent proton.Link, parentID, name, mimeType string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	nodeKey, nodeSecrets, passphraseEnc, passphraseSig, newNodeKR, err := d.generateNodeMaterial(parentKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	parentHashKey, err := parent.GetHashKey(parentKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	contentSessionKey, contentKeyPacket, contentKeyPacketSig, err := createContentKeyPacketAndSignature(newNodeKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	content, err := io.ReadAll(body)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	if options.KnownSize >= 0 && int64(len(content)) != options.KnownSize {
		return Node{}, RevisionAttrs{}, fmt.Errorf("content size %d does not match expected size %d", len(content), options.KnownSize)
	}
	plain := crypto.NewPlainMessage(content)
	encryptedBlock, err := contentSessionKey.Encrypt(plain)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	blockSignature, err := signEncryptedBlock(d.state.defaultAddrKR, plain, newNodeKR)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	contentKeyPacketBytes, err := base64.StdEncoding.DecodeString(contentKeyPacket)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	// Small-file verification token: last 32 bytes of the content key packet
	// XOR'd with the encrypted block data.
	verificationCode := last32(contentKeyPacketBytes)
	verificationToken := computeVerificationToken(verificationCode, encryptedBlock)
	sha256Digest := sha256.Sum256(encryptedBlock)
	sha1Digest := sha1.Sum(content)
	modTime := options.ModTime
	if modTime.IsZero() {
		modTime = time.Now().UTC()
	}
	xAttr := &revisionXAttrCommon{
		ModificationTime: modTime.Format("2006-01-02T15:04:05-0700"),
		Size:             int64(len(content)),
		BlockSizes:       []int64{int64(len(content))},
		Digests:          map[string]string{"SHA1": hex.EncodeToString(sha1Digest[:])},
	}
	manifestSig, err := d.state.defaultAddrKR.SignDetached(crypto.NewPlainMessage(sha256Digest[:]))
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	manifestSigStr, err := manifestSig.GetArmored()
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	commitReq := commitRevisionReq{ManifestSignature: manifestSigStr, SignatureAddress: d.signatureAddress()}
	if err := commitReq.setEncXAttrString(d.state.defaultAddrKR, newNodeKR, xAttr); err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	resp, err := d.uploadSmallFile(ctx, smallFileMetadata{
		ParentLinkID:                  parent.LinkID,
		Name:                          mustEncryptArmored(parentKR, []byte(name)),
		NameHash:                      getNameHash(name, parentHashKey),
		NodePassphrase:                passphraseEnc,
		NodePassphraseSignature:       passphraseSig,
		SignatureEmail:                d.signatureAddress(),
		NodeKey:                       nodeKey,
		MIMEType:                      mimeType,
		ContentKeyPacket:              contentKeyPacket,
		ContentKeyPacketSignature:     contentKeyPacketSig,
		ManifestSignature:             commitReq.ManifestSignature,
		ContentBlockEncSignature:      blockSignature,
		ContentBlockVerificationToken: base64.StdEncoding.EncodeToString(verificationToken),
		XAttr:                         commitReq.XAttr,
	}, encryptedBlock)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	d.storeNodeSecrets(resp.LinkID, nodeSecrets)
	d.ClearCache()
	node := Node{ID: resp.LinkID, ParentID: parentID, Name: name, Type: NodeTypeFile, Size: int64(len(content)), MIMEType: mimeType, ModTime: modTime, CreateTime: time.Now().UTC(), OriginalSHA1: hex.EncodeToString(sha1Digest[:])}
	attrs := RevisionAttrs{Size: int64(len(content)), ModTime: modTime, Digests: map[string]string{"SHA1": hex.EncodeToString(sha1Digest[:])}, BlockSizes: []int64{int64(len(content))}, EncryptedSize: int64(len(content))}
	return node, attrs, nil
}

// uploadLargeFileFlow creates a v2 draft file, uploads blocks, and commits the
// revision. This path is used for files larger than 4 MiB.
func (d *standaloneDriver) uploadLargeFileFlow(ctx context.Context, parent proton.Link, parentID, name, mimeType string, body io.Reader, options UploadOptions) (Node, RevisionAttrs, error) {
	linkID, revisionID, sessionKey, nodeKR, err := d.createFileUploadDraftV2(ctx, parent, name, mimeType, options.KnownSize)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	manifestSigData, fileSize, blockSizes, sha1Digest, blockTokens, err := d.uploadAndCollectBlockData(ctx, sessionKey, nodeKR, body, linkID, revisionID)
	if err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	modTime := options.ModTime
	if modTime.IsZero() {
		modTime = time.Now().UTC()
	}
	if err := d.commitNewRevision(ctx, manifestSigData, linkID, revisionID, blockTokens); err != nil {
		return Node{}, RevisionAttrs{}, err
	}
	d.ClearCache()
	node := Node{ID: linkID, ParentID: parentID, Name: name, Type: NodeTypeFile, Size: fileSize, MIMEType: mimeType, ModTime: modTime, CreateTime: time.Now().UTC(), OriginalSHA1: sha1Digest}
	attrs := RevisionAttrs{Size: fileSize, ModTime: modTime, Digests: map[string]string{"SHA1": sha1Digest}, BlockSizes: blockSizes, EncryptedSize: fileSize}
	return node, attrs, nil
}

// createFileUploadDraftV2 creates a draft file via the v2 API and returns the
// link ID, initial revision ID, content session key, and node keyring needed
// for the subsequent block uploads.
func (d *standaloneDriver) createFileUploadDraftV2(ctx context.Context, parent proton.Link, filename, mimeType string, intendedSize int64) (linkID, revisionID string, contentSK *crypto.SessionKey, nodeKR *crypto.KeyRing, err error) {
	parentKR, err := d.getLinkKR(ctx, parent)
	if err != nil {
		return
	}
	newNodeKey, _, passphraseEnc, passphraseSig, newNodeKR, err := d.generateNodeMaterial(parentKR)
	if err != nil {
		return
	}
	parentHashKey, err := parent.GetHashKey(parentKR)
	if err != nil {
		return
	}
	contentSK, contentKeyPacket, contentKeyPacketSig, err := createContentKeyPacketAndSignature(newNodeKR)
	if err != nil {
		return
	}
	var intendedUploadSize *int64
	if intendedSize > 0 {
		s := intendedSize
		intendedUploadSize = &s
	}
	resp, err := d.createDraftFile(ctx, draftFileReq{
		ParentLinkID:              parent.LinkID,
		Name:                      mustEncryptArmored(parentKR, []byte(filename)),
		Hash:                      getNameHash(filename, parentHashKey),
		MIMEType:                  mimeType,
		IntendedUploadSize:        intendedUploadSize,
		NodeKey:                   newNodeKey,
		NodePassphrase:            passphraseEnc,
		NodePassphraseSignature:   passphraseSig,
		ContentKeyPacket:          contentKeyPacket,
		ContentKeyPacketSignature: contentKeyPacketSig,
		SignatureAddress:          d.signatureAddress(),
	})
	if err != nil {
		return
	}
	return resp.File.ID, resp.File.RevisionID, contentSK, newNodeKR, nil
}

// uploadAndCollectBlockData reads the file body in 4 MiB chunks, encrypts and
// signs each block, requests upload URLs, uploads the blocks, and returns the
// manifest signature data and block tokens needed to commit the revision.
func (d *standaloneDriver) uploadAndCollectBlockData(ctx context.Context, sessionKey *crypto.SessionKey, nodeKR *crypto.KeyRing, file io.Reader, linkID, revisionID string) (manifestSigData []byte, totalSize int64, blockSizes []int64, sha1Digest string, tokens []proton.BlockToken, err error) {
	const uploadBlockSize = 4 * 1024 * 1024

	verificationInput, err := d.getVerificationInput(ctx, linkID, revisionID)
	if err != nil {
		return nil, 0, nil, "", nil, fmt.Errorf("fetch verification input: %w", err)
	}
	verificationCode, err := base64.StdEncoding.DecodeString(verificationInput.VerificationCode)
	if err != nil {
		return nil, 0, nil, "", nil, fmt.Errorf("decode verification code: %w", err)
	}

	type pendingBlock struct {
		index        int
		size         int64
		encSignature string
		hash         []byte
		verifier     []byte
		encData      []byte
	}

	manifestSigData = make([]byte, 0)
	pending := make([]pendingBlock, 0)
	sha1Digests := sha1.New()

	// Read and encrypt blocks.
	for index := 1; ; index++ {
		buf := make([]byte, uploadBlockSize)
		n, readErr := io.ReadFull(file, buf)
		if readErr != nil {
			if readErr == io.EOF || readErr == io.ErrUnexpectedEOF {
				if n == 0 {
					break
				}
				buf = buf[:n]
			} else {
				return nil, 0, nil, "", nil, readErr
			}
		} else {
			buf = buf[:n]
		}

		totalSize += int64(len(buf))
		sha1Digests.Write(buf)
		blockSizes = append(blockSizes, int64(len(buf)))

		plain := crypto.NewPlainMessage(buf)
		encData, err := sessionKey.EncryptAndSign(plain, d.state.defaultAddrKR)
		if err != nil {
			return nil, 0, nil, "", nil, err
		}

		detachedSig, err := d.state.defaultAddrKR.SignDetached(plain)
		if err != nil {
			return nil, 0, nil, "", nil, err
		}
		sigDataPacket, err := sessionKey.Encrypt(crypto.NewPlainMessage(detachedSig.GetBinary()))
		if err != nil {
			return nil, 0, nil, "", nil, err
		}
		keyPacket, err := nodeKR.EncryptSessionKey(sessionKey)
		if err != nil {
			return nil, 0, nil, "", nil, err
		}
		encSigArm, err := crypto.NewPGPSplitMessage(keyPacket, sigDataPacket).GetArmored()
		if err != nil {
			return nil, 0, nil, "", nil, err
		}

		verifier := computeVerificationToken(verificationCode, encData)
		hash := sha256Sum(encData)
		manifestSigData = append(manifestSigData, hash...)
		pending = append(pending, pendingBlock{index: index, size: int64(len(encData)), encSignature: encSigArm, hash: hash, verifier: verifier, encData: encData})
	}

	if len(pending) == 0 {
		return nil, 0, nil, "", nil, nil
	}

	// Request upload URLs from the server.
	uploadReq := blockUploadReqV2{
		AddressID:     d.state.mainShare.AddressID,
		VolumeID:      d.state.volumeID,
		LinkID:        linkID,
		RevisionID:    revisionID,
		BlockList:     make([]blockUploadInfoV2, 0, len(pending)),
		ThumbnailList: []any{},
	}
	for _, b := range pending {
		uploadReq.BlockList = append(uploadReq.BlockList, blockUploadInfoV2{
			Index:        b.index,
			Size:         b.size,
			EncSignature: b.encSignature,
			Hash:         b.hash,
			Verifier:     blockUploadVerifier{Token: base64.StdEncoding.EncodeToString(b.verifier)},
		})
	}
	uploadResp, err := d.requestBlockUploadV2(ctx, uploadReq)
	if err != nil {
		return nil, 0, nil, "", nil, err
	}
	if len(uploadResp.UploadLinks) != len(pending) {
		return nil, 0, nil, "", nil, fmt.Errorf("unexpected upload link count: got %d want %d", len(uploadResp.UploadLinks), len(pending))
	}

	// Upload each block.
	for i := range uploadResp.UploadLinks {
		if err := d.client.UploadBlock(ctx, uploadResp.UploadLinks[i].BareURL, uploadResp.UploadLinks[i].Token, byteMultipartStream(pending[i].encData)); err != nil {
			return nil, 0, nil, "", nil, err
		}
		tokens = append(tokens, proton.BlockToken{Index: pending[i].index, Token: uploadResp.UploadLinks[i].Token})
	}

	return manifestSigData, totalSize, blockSizes, hex.EncodeToString(sha1Digests.Sum(nil)), tokens, nil
}

// commitNewRevision signs the manifest hash and marks the revision as active.
func (d *standaloneDriver) commitNewRevision(ctx context.Context, manifestData []byte, linkID, revisionID string, blockTokens []proton.BlockToken) error {
	sig, err := d.state.defaultAddrKR.SignDetached(crypto.NewPlainMessage(manifestData))
	if err != nil {
		return err
	}
	sigStr, err := sig.GetArmored()
	if err != nil {
		return err
	}
	return d.client.UpdateRevision(ctx, d.state.mainShare.ShareID, linkID, revisionID, proton.UpdateRevisionReq{
		BlockList:         blockTokens,
		State:             proton.RevisionStateActive,
		ManifestSignature: sigStr,
		SignatureAddress:  d.signatureAddress(),
	})
}

// computeVerificationToken XORs the verification code with the encrypted data
// (zero-padded to match length) to produce the server verification token.
func computeVerificationToken(verificationCode, encryptedData []byte) []byte {
	token := make([]byte, len(verificationCode))
	for i := range verificationCode {
		if i < len(encryptedData) {
			token[i] = verificationCode[i] ^ encryptedData[i]
		} else {
			token[i] = verificationCode[i]
		}
	}
	return token
}

// signEncryptedBlock creates a detached encrypted signature for a plaintext
// block using the signing keyring, encrypted to the node keyring.
func signEncryptedBlock(signingKR *crypto.KeyRing, plain *crypto.PlainMessage, nodeKR *crypto.KeyRing) (string, error) {
	encSignature, err := signingKR.SignDetachedEncrypted(plain, nodeKR)
	if err != nil {
		return "", err
	}
	return encSignature.GetArmored()
}

// last32 returns the last 32 bytes of data, or the entire slice if shorter.
func last32(data []byte) []byte {
	if len(data) >= 32 {
		return data[len(data)-32:]
	}
	return data
}

// sha256Sum returns the SHA-256 hash of data.
func sha256Sum(data []byte) []byte {
	h := sha256.New()
	h.Write(data)
	return h.Sum(nil)
}
