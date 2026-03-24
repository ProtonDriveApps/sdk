package protondrive

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/ProtonMail/gopenpgp/v2/crypto"
	resty "github.com/go-resty/resty/v2"
)

// moveLinkReq is the JSON body for PUT /drive/shares/{shareID}/links/{linkID}/move.
type moveLinkReq struct {
	ParentLinkID            string `json:"ParentLinkID"`
	Name                    string `json:"Name"`
	OriginalHash            string `json:"OriginalHash"`
	Hash                    string `json:"Hash"`
	NodePassphrase          string `json:"NodePassphrase"`
	NodePassphraseSignature string `json:"NodePassphraseSignature,omitempty"`
	NameSignatureEmail      string `json:"NameSignatureEmail"`
	SignatureAddress        string `json:"SignatureEmail,omitempty"`
	ContentHash             string `json:"ContentHash,omitempty"`
}

// createRevisionRes is the inner response from creating a file revision.
type createRevisionRes struct {
	ID string `json:"ID"`
}

// draftFileReq is the JSON body for POST /drive/v2/volumes/{volumeID}/files
// (create a draft file for large-file upload).
type draftFileReq struct {
	ParentLinkID              string  `json:"ParentLinkID"`
	Name                      string  `json:"Name"`
	Hash                      string  `json:"Hash"`
	MIMEType                  string  `json:"MIMEType"`
	ClientUID                 *string `json:"ClientUID"`
	IntendedUploadSize        *int64  `json:"IntendedUploadSize"`
	NodeKey                   string  `json:"NodeKey"`
	NodePassphrase            string  `json:"NodePassphrase"`
	NodePassphraseSignature   string  `json:"NodePassphraseSignature"`
	ContentKeyPacket          string  `json:"ContentKeyPacket"`
	ContentKeyPacketSignature string  `json:"ContentKeyPacketSignature"`
	SignatureAddress          string  `json:"SignatureAddress"`
}

// draftFileRes is the response from creating a draft file.
type draftFileRes struct {
	File struct {
		ID         string `json:"ID"`
		RevisionID string `json:"RevisionID"`
	} `json:"File"`
}

// draftRevisionReq is the JSON body for creating a new revision on an existing file.
type draftRevisionReq struct {
	CurrentRevisionID  string  `json:"CurrentRevisionID"`
	ClientUID          *string `json:"ClientUID"`
	IntendedUploadSize *int64  `json:"IntendedUploadSize"`
}

// draftRevisionRes is the response from creating a new revision.
type draftRevisionRes struct {
	Revision struct {
		ID string `json:"ID"`
	} `json:"Revision"`
}

// blockUploadVerifier wraps the base64-encoded verification token for a block.
type blockUploadVerifier struct {
	Token string `json:"Token"`
}

// blockUploadInfoV2 describes a single block in a v2 block upload request.
type blockUploadInfoV2 struct {
	Index        int                 `json:"Index"`
	Size         int64               `json:"Size"`
	EncSignature string              `json:"EncSignature"`
	Hash         []byte              `json:"Hash"`
	Verifier     blockUploadVerifier `json:"Verifier"`
}

// blockUploadReqV2 is the JSON body for POST /drive/blocks to request upload URLs.
type blockUploadReqV2 struct {
	AddressID     string              `json:"AddressID"`
	VolumeID      string              `json:"VolumeID"`
	LinkID        string              `json:"LinkID"`
	RevisionID    string              `json:"RevisionID"`
	BlockList     []blockUploadInfoV2 `json:"BlockList"`
	ThumbnailList []any               `json:"ThumbnailList"`
}

// blockUploadResV2 is the response from POST /drive/blocks containing the
// signed URLs for uploading each block.
type blockUploadResV2 struct {
	UploadLinks []struct {
		Index   int    `json:"Index"`
		Token   string `json:"Token"`
		BareURL string `json:"BareURL"`
	} `json:"UploadLinks"`
}

// revisionXAttrCommon is the plaintext extended attributes for a revision,
// encrypted before being sent to the server.
type revisionXAttrCommon struct {
	ModificationTime string            `json:"ModificationTime"`
	Size             int64             `json:"Size"`
	BlockSizes       []int64           `json:"BlockSizes"`
	Digests          map[string]string `json:"Digests"`
}

// revisionXAttr wraps the common extended attributes in the JSON envelope
// expected by the server.
type revisionXAttr struct {
	Common revisionXAttrCommon `json:"Common"`
}

// commitRevisionReq is the JSON body for PUT .../revisions/{revisionID} to
// finalize a revision after all blocks are uploaded.
type commitRevisionReq struct {
	ManifestSignature string `json:"ManifestSignature"`
	SignatureAddress  string `json:"SignatureAddress"`
	XAttr             string `json:"XAttr"`
}

// smallFileMetadata contains all the metadata fields for the v2 small-file
// upload endpoint (POST /drive/v2/volumes/{volumeID}/files/small).
type smallFileMetadata struct {
	ParentLinkID                  string `json:"ParentLinkID"`
	Name                          string `json:"Name"`
	NameHash                      string `json:"NameHash"`
	NodePassphrase                string `json:"NodePassphrase"`
	NodePassphraseSignature       string `json:"NodePassphraseSignature"`
	SignatureEmail                string `json:"SignatureEmail"`
	NodeKey                       string `json:"NodeKey"`
	MIMEType                      string `json:"MIMEType"`
	ContentKeyPacket              string `json:"ContentKeyPacket"`
	ContentKeyPacketSignature     string `json:"ContentKeyPacketSignature"`
	ManifestSignature             string `json:"ManifestSignature"`
	ContentBlockEncSignature      string `json:"ContentBlockEncSignature,omitempty"`
	ContentBlockVerificationToken string `json:"ContentBlockVerificationToken,omitempty"`
	XAttr                         string `json:"XAttr"`
	Photo                         any    `json:"Photo"`
}

// smallFileResponse is the response from the small-file upload endpoint.
type smallFileResponse struct {
	LinkID     string `json:"LinkID"`
	RevisionID string `json:"RevisionID"`
}

// verificationInputResponse is the server response containing the verification
// code needed to compute block upload verification tokens.
type verificationInputResponse struct {
	VerificationCode string `json:"VerificationCode"`
	ContentKeyPacket string `json:"ContentKeyPacket"`
}

// blockVerificationInput is the response for block verification requests.
type blockVerificationInput struct {
	Token string `json:"Token"`
}

// linkBatchReq is the JSON body for batch link operations (trash, delete).
type linkBatchReq struct {
	LinkIDs []string `json:"LinkIDs"`
}

// batchLinkResponse is the response from batch link operations.
type batchLinkResponse struct {
	Responses map[string]struct {
		Code  int    `json:"Code"`
		Error string `json:"Error"`
	} `json:"Responses"`
}

// renameLinkReq is the JSON body for PUT .../links/{linkID}/rename.
type renameLinkReq struct {
	Name               string `json:"Name"`
	NameSignatureEmail string `json:"NameSignatureEmail"`
	Hash               string `json:"Hash,omitempty"`
	OriginalHash       string `json:"OriginalHash,omitempty"`
	MediaType          string `json:"MIMEType,omitempty"`
}

// setName encrypts the name and sets it on the move request.
func (req *moveLinkReq) setName(name string, addrKR, nodeKR *crypto.KeyRing) error {
	encName, err := getEncryptedName(name, addrKR, nodeKR)
	if err != nil {
		return err
	}
	req.Name = encName
	return nil
}

// setHash computes and sets the HMAC name hash on the move request.
func (req *moveLinkReq) setHash(name string, hashKey []byte) error {
	req.Hash = getNameHash(name, hashKey)
	return nil
}

// setEncXAttrString encrypts the extended attributes JSON and sets the
// XAttr field on the commit request.
func (req *commitRevisionReq) setEncXAttrString(addrKR, nodeKR *crypto.KeyRing, common *revisionXAttrCommon) error {
	jsonBytes, err := json.Marshal(revisionXAttr{Common: *common})
	if err != nil {
		return err
	}
	enc, err := nodeKR.Encrypt(crypto.NewPlainMessage(jsonBytes), addrKR)
	if err != nil {
		return err
	}
	armored, err := enc.GetArmored()
	if err != nil {
		return err
	}
	req.XAttr = armored
	return nil
}

// byteMultipartStream wraps a byte slice as a resty MultiPartStream for block uploads.
func byteMultipartStream(data []byte) resty.MultiPartStream {
	return resty.NewByteMultipartStream(data)
}

// moveLink calls PUT .../links/{linkID}/move to relocate a link.
func (d *standaloneDriver) moveLink(ctx context.Context, linkID string, req moveLinkReq) error {
	return d.doJSON(ctx, http.MethodPut, "/drive/shares/"+d.state.mainShare.ShareID+"/links/"+linkID+"/move", req, nil)
}

// createRevision calls POST .../files/{linkID}/revisions to start a new revision.
func (d *standaloneDriver) createRevision(ctx context.Context, linkID string) (createRevisionRes, error) {
	var res struct {
		Revision createRevisionRes `json:"Revision"`
	}
	err := d.doJSON(ctx, http.MethodPost, "/drive/shares/"+d.state.mainShare.ShareID+"/files/"+linkID+"/revisions", nil, &res)
	return res.Revision, err
}

// commitRevision calls PUT .../revisions/{revisionID} to finalize a revision.
func (d *standaloneDriver) commitRevision(ctx context.Context, linkID, revisionID string, req commitRevisionReq) error {
	return d.doJSON(ctx, http.MethodPut, "/drive/shares/"+d.state.mainShare.ShareID+"/files/"+linkID+"/revisions/"+revisionID, req, nil)
}

// deleteRevision calls DELETE .../revisions/{revisionID} to discard a draft revision.
func (d *standaloneDriver) deleteRevision(ctx context.Context, linkID, revisionID string) error {
	return d.doJSON(ctx, http.MethodDelete, "/drive/shares/"+d.state.mainShare.ShareID+"/files/"+linkID+"/revisions/"+revisionID, nil, nil)
}

// doJSON makes an authenticated JSON request to the Proton API. If body is
// non-nil, it is JSON-encoded and sent. If out is non-nil, the response body
// is JSON-decoded into it.
func (d *standaloneDriver) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, d.apiBaseURL()+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("x-pm-appversion", d.appVersion)
	req.Header.Set("Authorization", "Bearer "+d.session.AccessToken)
	req.Header.Set("x-pm-uid", d.session.UID)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected Proton status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// uploadSmallFile sends a multipart form POST to the small-file endpoint with
// the metadata JSON and encrypted content block.
func (d *standaloneDriver) uploadSmallFile(ctx context.Context, metadata smallFileMetadata, contentBlock []byte) (smallFileResponse, error) {
	var result smallFileResponse
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	metadataPayload, err := json.Marshal(metadata)
	if err != nil {
		return result, err
	}
	metadataPart, err := writer.CreateFormFile("Metadata", "Metadata")
	if err != nil {
		return result, err
	}
	if _, err := metadataPart.Write(metadataPayload); err != nil {
		return result, err
	}
	if len(contentBlock) > 0 {
		contentPart, err := writer.CreateFormFile("ContentBlock", "ContentBlock")
		if err != nil {
			return result, err
		}
		if _, err := contentPart.Write(contentBlock); err != nil {
			return result, err
		}
	}
	if err := writer.Close(); err != nil {
		return result, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.apiBaseURL()+"/drive/v2/volumes/"+d.state.mainShare.VolumeID+"/files/small", &body)
	if err != nil {
		return result, err
	}
	req.Header.Set("x-pm-appversion", d.appVersion)
	req.Header.Set("Authorization", "Bearer "+d.session.AccessToken)
	req.Header.Set("x-pm-uid", d.session.UID)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		return result, fmt.Errorf("unexpected Proton status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return result, err
	}
	return result, nil
}

// getVerificationInput calls GET .../verification to retrieve the server's
// verification code for large-file block uploads.
func (d *standaloneDriver) getVerificationInput(ctx context.Context, linkID, revisionID string) (verificationInputResponse, error) {
	var result verificationInputResponse
	err := d.doJSON(ctx, http.MethodGet, "/drive/v2/volumes/"+d.state.volumeID+"/links/"+linkID+"/revisions/"+revisionID+"/verification", nil, &result)
	return result, err
}

// createDraftFile calls POST /drive/v2/volumes/{volumeID}/files to create a
// draft file for large-file uploads.
func (d *standaloneDriver) createDraftFile(ctx context.Context, req draftFileReq) (draftFileRes, error) {
	var result draftFileRes
	err := d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/files", req, &result)
	return result, err
}

// createDraftRevision calls POST to create a new revision on an existing file.
func (d *standaloneDriver) createDraftRevision(ctx context.Context, linkID string, req draftRevisionReq) (draftRevisionRes, error) {
	var result draftRevisionRes
	err := d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/files/"+linkID+"/revisions", req, &result)
	return result, err
}

// requestBlockUploadV2 calls POST /drive/blocks to get signed upload URLs for
// a batch of encrypted blocks.
func (d *standaloneDriver) requestBlockUploadV2(ctx context.Context, req blockUploadReqV2) (blockUploadResV2, error) {
	var result blockUploadResV2
	err := d.doJSON(ctx, http.MethodPost, "/drive/blocks", req, &result)
	return result, err
}

// getBlockVerificationToken sends a verification token for a specific block
// and returns the server's confirmed token.
func (d *standaloneDriver) getBlockVerificationToken(ctx context.Context, linkID, revisionID string, blockIndex int, verificationToken []byte) (string, error) {
	var result blockVerificationInput
	err := d.doJSON(ctx, http.MethodPost, fmt.Sprintf("/drive/v2/volumes/%s/links/%s/revisions/%s/blocks/%d/verification", d.state.volumeID, linkID, revisionID, blockIndex), map[string]string{
		"VerificationToken": base64.StdEncoding.EncodeToString(verificationToken),
	}, &result)
	return result.Token, err
}

// renameLink calls PUT .../links/{linkID}/rename to change a link's name.
func (d *standaloneDriver) renameLink(ctx context.Context, linkID string, req renameLinkReq) error {
	return d.doJSON(ctx, http.MethodPut, "/drive/v2/volumes/"+d.state.volumeID+"/links/"+linkID+"/rename", req, nil)
}

// trashLinks calls POST .../trash_multiple to move links to the trash.
func (d *standaloneDriver) trashLinks(ctx context.Context, linkIDs []string) error {
	return d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/trash_multiple", linkBatchReq{LinkIDs: linkIDs}, nil)
}

// deleteTrashedLinks permanently deletes links that are already in the trash.
func (d *standaloneDriver) deleteTrashedLinks(ctx context.Context, linkIDs []string) error {
	return d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/trash/delete_multiple", linkBatchReq{LinkIDs: linkIDs}, nil)
}

// deleteLinks permanently deletes links (not via trash).
func (d *standaloneDriver) deleteLinks(ctx context.Context, linkIDs []string) error {
	return d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/delete_multiple", linkBatchReq{LinkIDs: linkIDs}, nil)
}

// emptyTrash calls DELETE .../trash to permanently delete all trashed items.
func (d *standaloneDriver) emptyTrash(ctx context.Context) error {
	return d.doJSON(ctx, http.MethodDelete, "/drive/volumes/"+d.state.volumeID+"/trash", nil, nil)
}

// apiBaseURL returns the normalized API base URL with /api suffix.
func (d *standaloneDriver) apiBaseURL() string {
	trimmed := strings.TrimRight(strings.TrimSpace(d.baseURL), "/")
	if trimmed == "" {
		return "https://mail.proton.me/api"
	}
	if strings.HasSuffix(trimmed, "/api") {
		return trimmed
	}
	return trimmed + "/api"
}
