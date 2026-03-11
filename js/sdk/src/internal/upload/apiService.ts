import { c } from 'ttag';

import { base64StringToUint8Array, uint8ArrayToBase64String } from '../../crypto';
import { AnonymousUser } from '../../interface';
import { APICodeError, DriveAPIService, drivePaths, isCodeOk } from '../apiService';
import { splitNodeUid, makeNodeUid, splitNodeRevisionUid, makeNodeRevisionUid } from '../uids';
import { UploadTokens } from './interface';
import { ThumbnailType } from '../../interface';

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

type PostLoadLinksMetadataRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostLoadLinksMetadataResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['responses']['200']['content']['application/json'];

type PostSmallFileFormData = Extract<
    Extract<
        drivePaths['/drive/v2/volumes/{volumeID}/files/small']['post']['requestBody'],
        { content: object }
    >['content']['multipart/form-data'],
    { Metadata: object }
>;
type PostSmallFileResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/small']['post']['responses']['200']['content']['application/json'];

type PostSmallRevisionFormData = Extract<
    Extract<
        drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/small']['post']['requestBody'],
        { content: object }
    >['content']['multipart/form-data'],
    { Metadata: object }
>;
type PostSmallRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/small']['post']['responses']['200']['content']['application/json'];

export class UploadAPIService {
    constructor(
        protected apiService: DriveAPIService,
        protected clientUid: string | undefined,
    ) {
        this.apiService = apiService;
        this.clientUid = clientUid;
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
            signatureEmail: string | AnonymousUser;
        },
    ): Promise<{
        nodeUid: string;
        nodeRevisionUid: string;
    }> {
        // The client shouldn't send the clear text size of the file.
        // The intented upload size is needed only for early validation that
        // the file can fit in the remaining quota to avoid data transfer when
        // the upload would be rejected. The backend will still validate
        // the quota during block upload and revision commit.
        const precision = 100_000; // bytes
        const intendedUploadSize =
            node.intendedUploadSize && node.intendedUploadSize > precision
                ? Math.floor(node.intendedUploadSize / precision) * precision
                : null;

        const { volumeId, nodeId: parentNodeId } = splitNodeUid(parentNodeUid);
        const result = await this.apiService.post<PostCreateDraftRequest, PostCreateDraftResponse>(
            `drive/v2/volumes/${volumeId}/files`,
            {
                ParentLinkID: parentNodeId,
                Name: node.armoredEncryptedName,
                Hash: node.hash,
                MIMEType: node.mediaType,
                ClientUID: this.clientUid || null,
                IntendedUploadSize: intendedUploadSize,
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
        verificationCode: Uint8Array<ArrayBuffer>;
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
        addressId: string | AnonymousUser,
        blocks: {
            contentBlocks: {
                index: number;
                armoredSignature: string;
                verificationToken: Uint8Array<ArrayBuffer>;
            }[];
            thumbnails?: {
                type: ThumbnailType;
            }[];
        },
    ): Promise<UploadTokens> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(draftNodeRevisionUid);
        const result = await this.apiService.post<
            // TODO: Deprected fields but not properly marked in the types.
            Omit<
                PostRequestBlockUploadRequest,
                'ShareID' | 'Thumbnail' | 'ThumbnailHash' | 'ThumbnailSize' | 'BlockList' | 'ThumbnailList'
            > & {
                BlockList: Omit<PostRequestBlockUploadRequest['BlockList'][0], 'Hash' | 'Size'>[];
                ThumbnailList: Omit<PostRequestBlockUploadRequest['ThumbnailList'][0], 'Hash' | 'Size'>[];
            },
            PostRequestBlockUploadResponse
        >('drive/blocks', {
            AddressID: addressId,
            VolumeID: volumeId,
            LinkID: nodeId,
            RevisionID: revisionId,
            BlockList: blocks.contentBlocks.map((block) => ({
                Index: block.index,
                EncSignature: block.armoredSignature,
                Verifier: {
                    Token: uint8ArrayToBase64String(block.verificationToken),
                },
            })),
            ThumbnailList: (blocks.thumbnails || []).map((block) => ({
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
            signatureEmail: string | AnonymousUser;
            armoredExtendedAttributes: string;
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
            XAttr: options.armoredExtendedAttributes,
            Photo: null, // Only used for photos in the Photo volume.
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
        block: Uint8Array<ArrayBuffer>,
        onProgress?: (uploadedBytes: number) => void,
        signal?: AbortSignal,
    ): Promise<void> {
        const formData = new FormData();
        formData.append('Block', new Blob([block]), 'blob');

        await this.apiService.postBlockStream(url, token, formData, onProgress, signal);
    }

    async isRevisionUploaded(nodeRevisionUid: string): Promise<boolean> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);
        const result = await this.apiService.post<PostLoadLinksMetadataRequest, PostLoadLinksMetadataResponse>(
            `drive/v2/volumes/${volumeId}/links`,
            {
                LinkIDs: [nodeId],
            },
        );
        if (result.Links.length === 0) {
            return false;
        }
        const link = result.Links[0];
        return (
            link.Link.State === 1 && // ACTIVE state
            link.File?.ActiveRevision?.RevisionID === revisionId
        );
    }

    async uploadSmallFile(
        parentFolderUid: string,
        metadata: {
            armoredEncryptedName: string;
            hash: string;
            mediaType: string;
            armoredNodeKey: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature: string;
            base64ContentKeyPacket: string;
            armoredContentKeyPacketSignature: string;
            armoredExtendedAttributes: string;
            signatureEmail: string | AnonymousUser;
        },
        content: {
            armoredManifestSignature: string;
            block:
                | {
                      encryptedData: Uint8Array<ArrayBuffer>;
                      armoredSignature: string;
                      verificationToken: Uint8Array<ArrayBuffer>;
                  }
                | undefined;
            thumbnails: {
                type: ThumbnailType;
                encryptedData: Uint8Array<ArrayBuffer>;
            }[];
        },
        signal?: AbortSignal,
    ): Promise<{ nodeUid: string; nodeRevisionUid: string }> {
        const { volumeId, nodeId: parentNodeId } = splitNodeUid(parentFolderUid);

        const metadataPayload: PostSmallFileFormData['Metadata'] = {
            ParentLinkID: parentNodeId,
            Name: metadata.armoredEncryptedName,
            NameHash: metadata.hash,
            NodePassphrase: metadata.armoredNodePassphrase,
            NodePassphraseSignature: metadata.armoredNodePassphraseSignature,
            SignatureEmail: metadata.signatureEmail,
            NodeKey: metadata.armoredNodeKey,
            MIMEType: metadata.mediaType,
            ContentKeyPacket: metadata.base64ContentKeyPacket,
            ContentKeyPacketSignature: metadata.armoredContentKeyPacketSignature,
            ManifestSignature: content.armoredManifestSignature,
            ContentBlockEncSignature: content.block ? content.block.armoredSignature : null,
            ContentBlockVerificationToken: content.block
                ? uint8ArrayToBase64String(content.block.verificationToken)
                : null,
            XAttr: metadata.armoredExtendedAttributes,
            Photo: null, // TODO
        };

        const formData = new FormData();
        formData.set('Metadata', new Blob([JSON.stringify(metadataPayload)], { type: 'application/json' }), 'Metadata');
        if (content.block) {
            formData.set('ContentBlock', new Blob([content.block.encryptedData]), 'ContentBlock');
        }
        for (const thumb of content.thumbnails) {
            if (formData.get(`ThumbnailBlockType_${thumb.type}`)) {
                throw new Error('Duplicate thumbnail types');
            }
            formData.set(
                `ThumbnailBlockType_${thumb.type}`,
                new Blob([thumb.encryptedData]),
                `ThumbnailBlockType_${thumb.type}`,
            );
        }

        const result = await this.apiService.postFormData<PostSmallFileResponse>(
            `drive/v2/volumes/${volumeId}/files/small`,
            formData,
            signal,
        );

        return {
            nodeUid: makeNodeUid(volumeId, result.LinkID),
            nodeRevisionUid: makeNodeRevisionUid(volumeId, result.LinkID, result.RevisionID),
        };
    }

    async uploadSmallRevision(
        nodeUid: string,
        currentRevisionUid: string,
        metadata: {
            signatureEmail: string | AnonymousUser | null;
            armoredExtendedAttributes: string;
        },
        content: {
            armoredManifestSignature: string;
            block:
                | {
                      encryptedData: Uint8Array<ArrayBuffer>;
                      armoredSignature: string;
                      verificationToken: Uint8Array<ArrayBuffer>;
                  }
                | undefined;
            thumbnails: {
                type: ThumbnailType;
                encryptedData: Uint8Array<ArrayBuffer>;
            }[];
        },
        signal?: AbortSignal,
    ): Promise<{ nodeUid: string; nodeRevisionUid: string }> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { revisionId: currentRevisionId } = splitNodeRevisionUid(currentRevisionUid);

        const metadataPayload: PostSmallRevisionFormData['Metadata'] = {
            CurrentRevisionID: currentRevisionId,
            SignatureEmail: metadata.signatureEmail,
            ManifestSignature: content.armoredManifestSignature,
            ContentBlockEncSignature: content.block ? content.block.armoredSignature : null,
            ContentBlockVerificationToken: content.block
                ? uint8ArrayToBase64String(content.block.verificationToken)
                : null,
            XAttr: metadata.armoredExtendedAttributes,
        };

        const formData = new FormData();
        formData.set('Metadata', new Blob([JSON.stringify(metadataPayload)], { type: 'application/json' }), 'Metadata');
        if (content.block) {
            formData.set('ContentBlock', new Blob([content.block.encryptedData]), 'ContentBlock');
        }
        for (const thumb of content.thumbnails) {
            if (formData.get(`ThumbnailBlockType_${thumb.type}`)) {
                throw new Error('Duplicate thumbnail types');
            }
            formData.set(
                `ThumbnailBlockType_${thumb.type}`,
                new Blob([thumb.encryptedData]),
                `ThumbnailBlockType_${thumb.type}`,
            );
        }

        const result = await this.apiService.postFormData<PostSmallRevisionResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/small`,
            formData,
            signal,
        );

        return {
            nodeUid: makeNodeUid(volumeId, result.LinkID),
            nodeRevisionUid: makeNodeRevisionUid(volumeId, result.LinkID, result.RevisionID),
        };
    }
}
