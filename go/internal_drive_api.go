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

type createRevisionRes struct {
	ID string `json:"ID"`
}

type revisionXAttrCommon struct {
	ModificationTime string            `json:"ModificationTime"`
	Size             int64             `json:"Size"`
	BlockSizes       []int64           `json:"BlockSizes"`
	Digests          map[string]string `json:"Digests"`
}

type revisionXAttr struct {
	Common revisionXAttrCommon `json:"Common"`
}

type commitRevisionReq struct {
	ManifestSignature string `json:"ManifestSignature"`
	SignatureAddress  string `json:"SignatureAddress"`
	XAttr             string `json:"XAttr"`
}

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

type smallFileResponse struct {
	LinkID     string `json:"LinkID"`
	RevisionID string `json:"RevisionID"`
}

type verificationInputResponse struct {
	VerificationCode string `json:"VerificationCode"`
	ContentKeyPacket string `json:"ContentKeyPacket"`
}

type linkBatchReq struct {
	LinkIDs []string `json:"LinkIDs"`
}

type batchLinkResponse struct {
	Responses map[string]struct {
		Code  int    `json:"Code"`
		Error string `json:"Error"`
	} `json:"Responses"`
}

type renameLinkReq struct {
	Name               string `json:"Name"`
	NameSignatureEmail string `json:"NameSignatureEmail"`
	Hash               string `json:"Hash,omitempty"`
	OriginalHash       string `json:"OriginalHash,omitempty"`
	MediaType          string `json:"MIMEType,omitempty"`
}

func (req *moveLinkReq) setName(name string, addrKR, nodeKR *crypto.KeyRing) error {
	encNameString, err := getEncryptedName(name, addrKR, nodeKR)
	if err != nil {
		return err
	}
	req.Name = encNameString
	return nil
}

func (req *moveLinkReq) setHash(name string, hashKey []byte) error {
	req.Hash = getNameHash(name, hashKey)
	return nil
}

func (req *commitRevisionReq) setEncXAttrString(addrKR, nodeKR *crypto.KeyRing, common *revisionXAttrCommon) error {
	jsonByteArr, err := json.Marshal(revisionXAttr{Common: *common})
	if err != nil {
		return err
	}
	encXattr, err := nodeKR.Encrypt(crypto.NewPlainMessage(jsonByteArr), addrKR)
	if err != nil {
		return err
	}
	encXattrString, err := encXattr.GetArmored()
	if err != nil {
		return err
	}
	req.XAttr = encXattrString
	return nil
}

func getEncryptedName(name string, addrKR, nodeKR *crypto.KeyRing) (string, error) {
	clearTextName := crypto.NewPlainMessageFromString(name)
	encName, err := nodeKR.Encrypt(clearTextName, addrKR)
	if err != nil {
		return "", err
	}
	return encName.GetArmored()
}

func createContentKeyPacketAndSignature(nodeKR *crypto.KeyRing) (*crypto.SessionKey, string, string, error) {
	newSessionKey, err := crypto.GenerateSessionKey()
	if err != nil {
		return nil, "", "", err
	}
	encSessionKey, err := nodeKR.EncryptSessionKey(newSessionKey)
	if err != nil {
		return nil, "", "", err
	}
	sessionKeyPlainMessage := crypto.NewPlainMessage(newSessionKey.Key)
	sessionKeySignature, err := nodeKR.SignDetached(sessionKeyPlainMessage)
	if err != nil {
		return nil, "", "", err
	}
	armoredSessionKeySignature, err := sessionKeySignature.GetArmored()
	if err != nil {
		return nil, "", "", err
	}
	return newSessionKey, base64.StdEncoding.EncodeToString(encSessionKey), armoredSessionKeySignature, nil
}

func byteMultipartStream(data []byte) resty.MultiPartStream {
	return resty.NewByteMultipartStream(data)
}

func (d *standaloneDriver) moveLink(ctx context.Context, linkID string, req moveLinkReq) error {
	return d.doJSON(ctx, http.MethodPut, "/drive/shares/"+d.state.mainShare.ShareID+"/links/"+linkID+"/move", req, nil)
}

func (d *standaloneDriver) createRevision(ctx context.Context, linkID string) (createRevisionRes, error) {
	var res struct {
		Revision createRevisionRes `json:"Revision"`
	}
	err := d.doJSON(ctx, http.MethodPost, "/drive/shares/"+d.state.mainShare.ShareID+"/files/"+linkID+"/revisions", nil, &res)
	return res.Revision, err
}

func (d *standaloneDriver) commitRevision(ctx context.Context, linkID, revisionID string, req commitRevisionReq) error {
	return d.doJSON(ctx, http.MethodPut, "/drive/shares/"+d.state.mainShare.ShareID+"/files/"+linkID+"/revisions/"+revisionID, req, nil)
}

func (d *standaloneDriver) deleteRevision(ctx context.Context, linkID, revisionID string) error {
	return d.doJSON(ctx, http.MethodDelete, "/drive/shares/"+d.state.mainShare.ShareID+"/files/"+linkID+"/revisions/"+revisionID, nil, nil)
}

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

func (d *standaloneDriver) getVerificationInput(ctx context.Context, linkID, revisionID string) (verificationInputResponse, error) {
	var result verificationInputResponse
	err := d.doJSON(ctx, http.MethodGet, "/drive/v2/volumes/"+d.state.volumeID+"/links/"+linkID+"/revisions/"+revisionID+"/verification", nil, &result)
	return result, err
}

func (d *standaloneDriver) renameLink(ctx context.Context, linkID string, req renameLinkReq) error {
	return d.doJSON(ctx, http.MethodPut, "/drive/v2/volumes/"+d.state.volumeID+"/links/"+linkID+"/rename", req, nil)
}

func (d *standaloneDriver) trashLinks(ctx context.Context, linkIDs []string) error {
	return d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/trash_multiple", linkBatchReq{LinkIDs: linkIDs}, nil)
}

func (d *standaloneDriver) deleteTrashedLinks(ctx context.Context, linkIDs []string) error {
	return d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/trash/delete_multiple", linkBatchReq{LinkIDs: linkIDs}, nil)
}

func (d *standaloneDriver) deleteLinks(ctx context.Context, linkIDs []string) error {
	return d.doJSON(ctx, http.MethodPost, "/drive/v2/volumes/"+d.state.volumeID+"/delete_multiple", linkBatchReq{LinkIDs: linkIDs}, nil)
}

func (d *standaloneDriver) emptyTrash(ctx context.Context) error {
	return d.doJSON(ctx, http.MethodDelete, "/drive/volumes/"+d.state.volumeID+"/trash", nil, nil)
}

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
