import { c } from 'ttag';

import { base64StringToUint8Array, uint8ArrayToBase64String } from '../../crypto';
import { APICodeError, DriveAPIService, drivePaths, isCodeOk } from '../apiService';
import { splitNodeUid, makeNodeUid, splitNodeRevisionUid, makeNodeRevisionUid } from '../uids';
import { UploadTokens } from './interface';
import { ThumbnailType } from '../../interface';

type PostCheckAvailableHashesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/checkAvailableHashes']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCheckAvailableHashesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/checkAvailableHashes']['post']['responses']['200']['content']['application/json'];

type PostCreateDraftRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/files']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCreateDraftResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files']['post']['responses']['200']['content']['application/json'];

type PostCreateDraftRevisionRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCreateDraftRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions']['post']['responses']['200']['content']['application/json'];

type GetVerificationDataResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/revisions/{revisionID}/verification']['get']['responses']['200']['content']['application/json'];

type PostRequestBlockUploadRequest = Extract<
    drivePaths['/drive/blocks']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostRequestBlockUploadResponse =
    drivePaths['/drive/blocks']['post']['responses']['200']['content']['application/json'];

type PostCommitRevisionRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCommitRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['put']['responses']['200']['content']['application/json'];

type PostDeleteNodesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/delete_multiple']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostDeleteNodesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/delete_multiple']['post']['responses']['200']['content']['application/json'];

export class UploadAPIService {
    constructor(
        private apiService: DriveAPIService,
        private clientUid: string | undefined,
    ) {
        this.apiService = apiService;
        this.clientUid = clientUid;
    }

    async checkAvailableHashes(
        parentNodeUid: string,
        hashes: string[],
    ): Promise<{
        availalbleHashes: string[];
        pendingHashes: {
            hash: string;
            nodeUid: string;
            revisionUid: string;
            clientUid?: string;
        }[];
    }> {
        const { volumeId, nodeId: parentNodeId } = splitNodeUid(parentNodeUid);
        const result = await this.apiService.post<PostCheckAvailableHashesRequest, PostCheckAvailableHashesResponse>(
            `drive/v2/volumes/${volumeId}/links/${parentNodeId}/checkAvailableHashes`,
            {
                Hashes: hashes,
                ClientUID: this.clientUid ? [this.clientUid] : null,
            },
        );

        return {
            availalbleHashes: result.AvailableHashes,
            pendingHashes: result.PendingHashes.map((hash) => ({
                hash: hash.Hash,
                nodeUid: makeNodeUid(volumeId, hash.LinkID),
                revisionUid: makeNodeRevisionUid(volumeId, hash.LinkID, hash.RevisionID),
                clientUid: hash.ClientUID || undefined,
            })),
        };
    }

    async createDraft(
        parentNodeUid: string,
        node: {
            armoredEncryptedName: string;
            hash: string;
            mediaType: string;
            intendedUploadSize?: number;
            armoredNodeKey: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature: string;
            base64ContentKeyPacket: string;
            armoredContentKeyPacketSignature: string;
            signatureEmail: string;
        },
    ): Promise<{
        nodeUid: string;
        nodeRevisionUid: string;
    }> {
        const { volumeId, nodeId: parentNodeId } = splitNodeUid(parentNodeUid);
        const result = await this.apiService.post<PostCreateDraftRequest, PostCreateDraftResponse>(
            `drive/v2/volumes/${volumeId}/files`,
            {
                ParentLinkID: parentNodeId,
                Name: node.armoredEncryptedName,
                Hash: node.hash,
                MIMEType: node.mediaType,
                ClientUID: this.clientUid || null,
                IntendedUploadSize: node.intendedUploadSize || null,
                NodeKey: node.armoredNodeKey,
                NodePassphrase: node.armoredNodePassphrase,
                NodePassphraseSignature: node.armoredNodePassphraseSignature,
                ContentKeyPacket: node.base64ContentKeyPacket,
                ContentKeyPacketSignature: node.armoredContentKeyPacketSignature,
                SignatureAddress: node.signatureEmail,
            },
        );

        return {
            nodeUid: makeNodeUid(volumeId, result.File.ID),
            nodeRevisionUid: makeNodeRevisionUid(volumeId, result.File.ID, result.File.RevisionID),
        };
    }

    async createDraftRevision(
        nodeUid: string,
        revision: {
            currentRevisionUid: string;
            intendedUploadSize?: number;
        },
    ): Promise<{
        nodeRevisionUid: string;
    }> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { revisionId: currentRevisionId } = splitNodeRevisionUid(revision.currentRevisionUid);

        const result = await this.apiService.post<PostCreateDraftRevisionRequest, PostCreateDraftRevisionResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions`,
            {
                CurrentRevisionID: currentRevisionId,
                ClientUID: this.clientUid || null,
                IntendedUploadSize: revision.intendedUploadSize || null,
            },
        );

        return {
            nodeRevisionUid: makeNodeRevisionUid(volumeId, nodeId, result.Revision.ID),
        };
    }

    async getVerificationData(draftNodeRevisionUid: string): Promise<{
        verificationCode: Uint8Array;
        base64ContentKeyPacket: string;
    }> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        const result = await this.apiService.get<GetVerificationDataResponse>(
            `drive/v2/volumes/${volumeId}/links/${nodeId}/revisions/${revisionId}/verification`,
        );

        return {
            verificationCode: base64StringToUint8Array(result.VerificationCode),
            base64ContentKeyPacket: result.ContentKeyPacket,
        };
    }

    async requestBlockUpload(
        draftNodeRevisionUid: string,
        addressId: string,
        blocks: {
            contentBlocks: {
                index: number;
                hash: Uint8Array;
                encryptedSize: number;
                armoredSignature: string;
                verificationToken: Uint8Array;
            }[];
            thumbnails?: {
                type: ThumbnailType;
                hash: Uint8Array;
                encryptedSize: number;
            }[];
        },
    ): Promise<UploadTokens> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        const result = await this.apiService.post<
            // TODO: Deprected fields but not properly marked in the types.
            Omit<PostRequestBlockUploadRequest, 'ShareID' | 'Thumbnail' | 'ThumbnailHash' | 'ThumbnailSize'>,
            PostRequestBlockUploadResponse
        >('drive/blocks', {
            AddressID: addressId,
            VolumeID: volumeId,
            LinkID: nodeId,
            RevisionID: revisionId,
            BlockList: blocks.contentBlocks.map((block) => ({
                Index: block.index,
                Hash: uint8ArrayToBase64String(block.hash),
                EncSignature: block.armoredSignature,
                Size: block.encryptedSize,
                Verifier: {
                    Token: uint8ArrayToBase64String(block.verificationToken),
                },
            })),
            ThumbnailList: (blocks.thumbnails || []).map((block) => ({
                Hash: uint8ArrayToBase64String(block.hash),
                Size: block.encryptedSize,
                Type: block.type,
            })),
        });

        return {
            blockTokens: result.UploadLinks.map((link) => ({
                index: link.Index,
                bareUrl: link.BareURL,
                token: link.Token,
            })),
            thumbnailTokens: (result.ThumbnailLinks || []).map((link) => ({
                // We can type as ThumbnailType because we are passing the type in the request.
                type: link.ThumbnailType as ThumbnailType,
                bareUrl: link.BareURL,
                token: link.Token,
            })),
        };
    }

    async commitDraftRevision(
        draftNodeRevisionUid: string,
        options: {
            armoredManifestSignature: string;
            signatureEmail: string;
            armoredExtendedAttributes?: string;
        },
    ): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        await this.apiService.put<
            // TODO: Deprected fields but not properly marked in the types.
            Omit<PostCommitRevisionRequest, 'BlockNumber' | 'BlockList' | 'ThumbnailToken' | 'State'>,
            PostCommitRevisionResponse
        >(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`, {
            ManifestSignature: options.armoredManifestSignature,
            SignatureAddress: options.signatureEmail,
            XAttr: options.armoredExtendedAttributes || null,
            Photo: null, // TODO
        });
    }

    async deleteDraft(draftNodeUid: string): Promise<void> {
        const { volumeId, nodeId } = splitNodeUid(draftNodeUid);

        const response = await this.apiService.post<PostDeleteNodesRequest, PostDeleteNodesResponse>(
            `drive/v2/volumes/${volumeId}/delete_multiple`,
            {
                LinkIDs: [nodeId],
            },
        );

        const code = response.Responses?.[0].Response.Code || 0;
        if (!isCodeOk(code)) {
            throw new APICodeError(c('Error').t`Unknown error ${code}`, code);
        }
    }

    async deleteDraftRevision(draftNodeRevisionUid: string): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        await this.apiService.delete(`/drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`);
    }

    async uploadBlock(
        url: string,
        token: string,
        block: Uint8Array,
        onProgress?: (uploadedBytes: number) => void,
        signal?: AbortSignal,
    ): Promise<void> {
        const formData = new FormData();
        formData.append('Block', new Blob([block]), 'blob');

        await this.apiService.postBlockStream(url, token, formData, onProgress, signal);
    }
}
