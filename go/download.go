package protondrive

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"time"

	proton "github.com/ProtonMail/go-proton-api"
	"github.com/ProtonMail/gopenpgp/v2/crypto"
)

// getRevisionAttrs returns the metadata for the current active revision of a
// file node, including size, block layout, and checksums.
func (d *standaloneDriver) getRevisionAttrs(ctx context.Context, nodeID string) (RevisionAttrs, error) {
	link, err := d.getLink(ctx, nodeID)
	if err != nil {
		return RevisionAttrs{}, err
	}
	if link.Type != proton.LinkTypeFile {
		return RevisionAttrs{}, fmt.Errorf("link %s is not a file", nodeID)
	}
	activeRevision, err := d.getActiveRevisionMetadata(ctx, link)
	if err != nil {
		return RevisionAttrs{}, err
	}
	attrs := RevisionAttrs{
		Size:          activeRevision.Size,
		ModTime:       time.Unix(link.ModifyTime, 0),
		Digests:       map[string]string{},
		EncryptedSize: link.Size,
	}
	revision, err := d.getRevisionAllBlocks(ctx, link.LinkID, activeRevision.ID)
	if err != nil {
		return RevisionAttrs{}, err
	}
	// Reconstruct block sizes: each block is up to 4 MiB except the last.
	const blockSize = 4 * 1024 * 1024
	attrs.BlockSizes = make([]int64, 0, len(revision.Blocks))
	remaining := attrs.Size
	for range revision.Blocks {
		if remaining <= 0 {
			attrs.BlockSizes = append(attrs.BlockSizes, 0)
		} else if remaining < blockSize {
			attrs.BlockSizes = append(attrs.BlockSizes, remaining)
			remaining = 0
		} else {
			attrs.BlockSizes = append(attrs.BlockSizes, blockSize)
			remaining -= blockSize
		}
	}
	return attrs, nil
}

// getActiveRevisionMetadata returns the metadata for the single active revision
// of a file link. Returns an error if zero or multiple active revisions exist.
func (d *standaloneDriver) getActiveRevisionMetadata(ctx context.Context, link proton.Link) (proton.RevisionMetadata, error) {
	revisions, err := d.client.ListRevisions(ctx, d.state.mainShare.ShareID, link.LinkID)
	if err != nil {
		return proton.RevisionMetadata{}, err
	}
	var active *proton.RevisionMetadata
	for i := range revisions {
		if revisions[i].State == proton.RevisionStateActive {
			if active != nil {
				return proton.RevisionMetadata{}, fmt.Errorf("multiple active revisions for %s", link.LinkID)
			}
			active = &revisions[i]
		}
	}
	if active == nil {
		return proton.RevisionMetadata{}, fmt.Errorf("no active revision for %s", link.LinkID)
	}
	return *active, nil
}

// getRevisionAllBlocks fetches a revision with all its block metadata,
// paginating as needed (150 blocks per page).
func (d *standaloneDriver) getRevisionAllBlocks(ctx context.Context, linkID, revisionID string) (proton.Revision, error) {
	const pageSize = 150
	fromBlock := 1
	var full proton.Revision
	for {
		revision, err := d.client.GetRevision(ctx, d.state.mainShare.ShareID, linkID, revisionID, fromBlock, pageSize)
		if err != nil {
			return proton.Revision{}, err
		}
		if fromBlock == 1 {
			full.RevisionMetadata = revision.RevisionMetadata
		}
		full.Blocks = append(full.Blocks, revision.Blocks...)
		if len(revision.Blocks) < pageSize {
			break
		}
		fromBlock = len(full.Blocks) + 1
	}
	return full, nil
}

// fileDownloadReader implements io.ReadCloser for streaming decrypted file
// content. It lazily fetches and decrypts blocks on each Read call.
type fileDownloadReader struct {
	driver     *standaloneDriver
	ctx        context.Context
	link       *proton.Link
	data       *bytes.Buffer
	nodeKR     *crypto.KeyRing
	sessionKey *crypto.SessionKey
	revision   *proton.Revision
	nextBlock  int
	isEOF      bool
}

func (r *fileDownloadReader) Read(p []byte) (int, error) {
	if r.data.Len() == 0 {
		r.data = bytes.NewBuffer(nil)
		if err := r.populate(); err != nil {
			return 0, err
		}
		if r.isEOF {
			return 0, io.EOF
		}
	}
	return r.data.Read(p)
}

func (r *fileDownloadReader) Close() error {
	r.driver = nil
	r.ctx = nil
	r.link = nil
	r.nodeKR = nil
	r.sessionKey = nil
	r.revision = nil
	r.data = nil
	return nil
}

// populate fetches the next encrypted block, decrypts it, and writes the
// plaintext into the internal buffer.
func (r *fileDownloadReader) populate() error {
	if r.revision == nil || len(r.revision.Blocks) == 0 || r.nextBlock >= len(r.revision.Blocks) {
		r.isEOF = true
		return nil
	}
	block := r.revision.Blocks[r.nextBlock]
	blockReader, err := r.driver.client.GetBlock(r.ctx, block.BareURL, block.Token)
	if err != nil {
		return err
	}
	defer blockReader.Close() //nolint:errcheck // best-effort close on response body
	verificationKR, err := r.driver.buildSignatureVerificationKR([]string{block.SignatureEmail}, r.nodeKR)
	if err != nil {
		return err
	}
	if err := decryptBlockIntoBuffer(r.sessionKey, verificationKR, r.nodeKR, block.Hash, block.EncSignature, r.data, blockReader); err != nil {
		return err
	}
	r.nextBlock++
	return nil
}

// buildSignatureVerificationKR assembles a keyring containing keys for the
// given email addresses, used to verify block signatures during download.
func (d *standaloneDriver) buildSignatureVerificationKR(emails []string, extra ...*crypto.KeyRing) (*crypto.KeyRing, error) {
	ret, err := crypto.NewKeyRing(nil)
	if err != nil {
		return nil, err
	}
	for _, email := range emails {
		for _, address := range d.state.addresses {
			if address.Email != email {
				continue
			}
			if kr := d.state.addrKRs[address.ID]; kr != nil {
				if err := addKeysFromKR(ret, kr); err != nil {
					return nil, err
				}
			}
		}
	}
	if err := addKeysFromKR(ret, extra...); err != nil {
		return nil, err
	}
	if ret.CountEntities() == 0 {
		return nil, fmt.Errorf("no keys available for signature verification")
	}
	return ret, nil
}

// addKeysFromKR copies all keys from source keyrings into the destination.
func addKeysFromKR(dest *crypto.KeyRing, sources ...*crypto.KeyRing) error {
	for _, src := range sources {
		if src == nil {
			continue
		}
		for _, key := range src.GetKeys() {
			if err := dest.AddKey(key); err != nil {
				return err
			}
		}
	}
	return nil
}

// decryptBlockIntoBuffer reads an encrypted block, decrypts it with the session
// key, verifies the detached encrypted signature against the expected hash, and
// writes the plaintext to buffer.
func decryptBlockIntoBuffer(sessionKey *crypto.SessionKey, addrKR, nodeKR *crypto.KeyRing, expectedHash, encSignature string, buffer io.Writer, block io.ReadCloser) error {
	data, err := io.ReadAll(block)
	if err != nil {
		return err
	}
	plainMessage, err := sessionKey.Decrypt(data)
	if err != nil {
		return err
	}
	encSigMsg, err := crypto.NewPGPMessageFromArmored(encSignature)
	if err != nil {
		return err
	}
	if err := addrKR.VerifyDetachedEncrypted(plainMessage, encSigMsg, nodeKR, crypto.GetUnixTime()); err != nil {
		return err
	}
	if _, err := io.Copy(buffer, plainMessage.NewReader()); err != nil {
		return err
	}
	h := sha256.New()
	h.Write(data)
	if base64.StdEncoding.EncodeToString(h.Sum(nil)) != expectedHash {
		return fmt.Errorf("downloaded block hash verification failed")
	}
	return nil
}

// locateBlockOffset finds the block index and intra-block offset for a given
// byte offset into the decrypted file stream.
func locateBlockOffset(blockSizes []int64, offset int64) (blockIndex int, intraBlockOffset int64, err error) {
	if offset < 0 {
		return 0, 0, fmt.Errorf("offset must be non-negative")
	}
	cumulative := int64(0)
	for i, size := range blockSizes {
		if offset < cumulative+size {
			return i, offset - cumulative, nil
		}
		cumulative += size
	}
	if offset == cumulative {
		return len(blockSizes), 0, nil
	}
	return 0, 0, io.EOF
}
