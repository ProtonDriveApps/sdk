import { base64StringToUint8Array, uint8ArrayToBase64String } from "../../crypto";
import { DriveAPIService, drivePaths } from "../apiService";
import { splitNodeUid, makeNodeUid, splitNodeRevisionUid, makeNodeRevisionUid } from "../uids";

type PostCheckAvailableHashesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/checkAvailableHashes']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCheckAvailableHashesResponse = drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/checkAvailableHashes']['post']['responses']['200']['content']['application/json'];

type PostCreateDraftRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/files']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateDraftResponse = drivePaths['/drive/v2/volumes/{volumeID}/files']['post']['responses']['200']['content']['application/json'];

type PostCreateDraftRevisionRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateDraftRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions']['post']['responses']['200']['content']['application/json'];

type GetVerificationDataResponse = drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/revisions/{revisionID}/verification']['get']['responses']['200']['content']['application/json'];

type PostRequestBlockUploadRequest = Extract<drivePaths['/drive/blocks']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostRequestBlockUploadResponse = drivePaths['/drive/blocks']['post']['responses']['200']['content']['application/json'];

type PostCommitRevisionRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCommitRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['put']['responses']['200']['content']['application/json'];

export class UploadAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async checkAvailableHashes(nodeUid: string, hashes: string[]): Promise<{
        availalbleHashes: string[],
        pendingHashes: {
            hash: string,
            revisionUid: string,
            clientUid?: string,
        }[],
    }> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const result = await this.apiService.post<
            PostCheckAvailableHashesRequest,
            PostCheckAvailableHashesResponse
        >(`drive/v2/volumes/${volumeId}/links/${nodeId}/checkAvailableHashes`, {
            Hashes: hashes,
            ClientUID: null,
        });

        return {
            availalbleHashes: result.AvailableHashes,
            pendingHashes: result.PendingHashes.map((hash) => ({
                hash: hash.Hash,
                revisionUid: makeNodeRevisionUid(volumeId, hash.LinkID, hash.RevisionID),
                clientUid: hash.ClientUID || undefined,
            })),
        }
    }

    async createDraft(parentNodeUid: string, node: {
        armoredEncryptedName: string,
        hash: string,
        mimeType: string,
        clientUID?: string,
        intendedUploadSize?: number,
        armoredNodeKey: string,
        armoredNodePassphrase: string,
        armoredNodePassphraseSignature: string,
        armoredContentKeyPacket: string,
        armoredContentKeyPacketSignature: string,
        signatureEmail: string,
    }): Promise<{
        nodeUid: string,
        nodeRevisionUid: string,
    }> {
        const { volumeId, nodeId: parentNodeId } = splitNodeUid(parentNodeUid);
        const result = await this.apiService.post<
            PostCreateDraftRequest,
            PostCreateDraftResponse
        >(`drive/v2/volumes/${volumeId}/files`, {
            ParentLinkID: parentNodeId,
            Name: node.armoredEncryptedName,
            Hash: node.hash,
            MIMEType: node.mimeType,
            ClientUID: node.clientUID || null,
            IntendedUploadSize: node.intendedUploadSize || null,
            NodeKey: node.armoredNodeKey,
            NodePassphrase: node.armoredNodePassphrase,
            NodePassphraseSignature: node.armoredNodePassphraseSignature,
            ContentKeyPacket: node.armoredContentKeyPacket,
            ContentKeyPacketSignature: node.armoredContentKeyPacketSignature,
            SignatureAddress: node.signatureEmail,
        });

        return {
            nodeUid: makeNodeUid(volumeId, result.File.ID),
            nodeRevisionUid: makeNodeRevisionUid(volumeId, result.File.ID, result.File.RevisionID),
        }
    }

    async createDraftRevision(nodeUid: string, revision: {
        currentRevisionUid: string,
        clientUID?: string,
        intendedUploadSize?: number,
    }): Promise<{
        nodeRevisionsUid: string,
    }> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { revisionId: currentRevisionId } = splitNodeRevisionUid(revision.currentRevisionUid);
        
        const result = await this.apiService.post<
            PostCreateDraftRevisionRequest,
            PostCreateDraftRevisionResponse
        >(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions`, {
            CurrentRevisionID: currentRevisionId,
            ClientUID: revision.clientUID || null,
            IntendedUploadSize: revision.intendedUploadSize || null,
        });

        return {
            nodeRevisionsUid: makeNodeRevisionUid(volumeId, nodeId, result.Revision.ID),
        }
    }

    async getVerificationData(draftNodeRevisionUid: string): Promise<{
        verificationCode: Uint8Array,
    }> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        const result = await this.apiService.get<
            GetVerificationDataResponse
        >(`drive/v2/volumes/${volumeId}/links/${nodeId}/revisions/${revisionId}/verification`);
        
        return {
            verificationCode: base64StringToUint8Array(result.VerificationCode),
        }
    }

    async requestBlockUpload(draftNodeRevisionUid: string, addressId: string, blocks: {
        content: {
            index: number,
            hash: Uint8Array,
            armoredSignature: string,
            size: number,
            verificationToken: Uint8Array,
        }[],
        thumbnail: {
            hash: Uint8Array,
            size: number,
            type: 1 | 2,
        }[],
    }): Promise<{
        blockTokens: {
            barUrl: string,
            index: number,
            token: string,
        }[],
        thumbnailTokens: {
            bareUrl: string,
            token: string,
        }[],
    }> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        const result = await this.apiService.post<
            // FIXME: Deprected fields but not properly marked in the types.
            Omit<PostRequestBlockUploadRequest, 'ShareID' | 'Thumbnail' | 'ThumbnailHash' | 'ThumbnailSize'>,
            PostRequestBlockUploadResponse
        >('drive/blocks', {
            AddressID: addressId,
            VolumeID: volumeId,
            LinkID: nodeId,
            RevisionID: revisionId,
            BlockList: blocks.content.map((block) => ({
                Index: block.index,
                Hash: uint8ArrayToBase64String(block.hash),
                EncSignature: block.armoredSignature,
                Size: block.size,
                Verifier: {
                    Token: uint8ArrayToBase64String(block.verificationToken),
                },
            })),
            ThumbnailList: blocks.thumbnail.map((block) => ({
                Hash: uint8ArrayToBase64String(block.hash),
                Size: block.size,
                Type: block.type,
            })),
        });

        return {
            blockTokens: result.UploadLinks.map((link) => ({
                barUrl: link.BareURL,
                index: link.Index,
                token: link.Token,
            })),
            thumbnailTokens: (result.ThumbnailLinks || []).map((link) => ({
                bareUrl: link.BareURL,
                thumbnailType: link.ThumbnailType,
                token: link.Token,
            })),
        };
    }

    async commitDraftRevision(draftNodeRevisionUid: string, options: {
        armoredManifestSignature: string,
        signatureEmail: string,
        armoredEncryptedExtendedAttributes: string,
    }): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        await this.apiService.put<
            // FIXME: Deprected fields but not properly marked in the types.
            Omit<PostCommitRevisionRequest, 'BlockNumber' | 'BlockList' | 'ThumbnailToken' | 'State'>,
            PostCommitRevisionResponse
        >(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`, {
            ManifestSignature: options.armoredManifestSignature,
            SignatureAddress: options.signatureEmail,
            XAttr: options.armoredEncryptedExtendedAttributes,
            Photo: null, // FIXME
        });
    }

    async deleteDraftRevision(draftNodeRevisionUid: string): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        this.apiService.delete(`/drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`);
    }
}
