import { c } from 'ttag';

import { NodeWithSameNameExistsValidationError, ProtonDriveError, ValidationError } from '../../errors';
import { Logger, NodeResult, MemberRole, RevisionState, AnonymousUser } from '../../interface';
import {
    DriveAPIService,
    drivePaths,
    ErrorCode,
    InvalidRequirementsAPIError,
    isCodeOk,
    nodeTypeNumberToNodeType,
    permissionsToMemberRole,
} from '../apiService';
import { asyncIteratorRace } from '../asyncIteratorRace';
import { batch } from '../batch';
import { splitNodeUid, makeNodeUid, makeNodeRevisionUid, splitNodeRevisionUid, makeNodeThumbnailUid } from '../uids';
import { NodeOutOfSyncError } from './errors';
import { EncryptedNode, EncryptedRevision, FilterOptions, Thumbnail } from './interface';

// This is the number of calls to the API that are made in parallel.
const API_CONCURRENCY = 15;

// This is the number of nodes that are loaded from the API in one call.
const API_NODES_BATCH_SIZE = 100;

type PostLoadLinksMetadataRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostLoadLinksMetadataResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['responses']['200']['content']['application/json'];

type GetChildrenResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/children']['get']['responses']['200']['content']['application/json'];

type GetTrashedNodesResponse =
    drivePaths['/drive/volumes/{volumeID}/trash']['get']['responses']['200']['content']['application/json'];

type PutRenameNodeRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/rename']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PutRenameNodeResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/rename']['put']['responses']['200']['content']['application/json'];

type PutMoveNodeRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PutMoveNodeResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['responses']['200']['content']['application/json'];

type PostCopyNodeRequest = Extract<
    drivePaths['/drive/volumes/{volumeID}/links/{linkID}/copy']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCopyNodeResponse =
    drivePaths['/drive/volumes/{volumeID}/links/{linkID}/copy']['post']['responses']['200']['content']['application/json'];

type EmptyTrashResponse =
    drivePaths['/drive/volumes/{volumeID}/trash']['delete']['responses']['200']['content']['application/json'];

type PostTrashNodesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/trash_multiple']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostTrashNodesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/trash_multiple']['post']['responses']['200']['content']['application/json'];

type PutRestoreNodesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['requestBody'],
    { content: object }
>['content']['application/json'];
type PutRestoreNodesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['responses']['200']['content']['application/json'];

type PostDeleteTrashedNodesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostDeleteTrashedNodesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['responses']['200']['content']['application/json'];

type PostDeleteMyNodesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/remove-mine']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostDeleteMyNodesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/remove-mine']['post']['responses']['200']['content']['application/json'];

type PostCreateFolderRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCreateFolderResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['responses']['200']['content']['application/json'];

type GetRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['get']['responses']['200']['content']['application/json'];
type GetRevisionsResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions']['get']['responses']['200']['content']['application/json'];
enum APIRevisionState {
    Draft = 0,
    Active = 1,
    Obsolete = 2,
}

type PostRestoreRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}/restore']['post']['responses']['202']['content']['application/json'];

type DeleteRevisionResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['delete']['responses']['200']['content']['application/json'];

type PostCheckAvailableHashesRequest = Extract<
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/checkAvailableHashes']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostCheckAvailableHashesResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/checkAvailableHashes']['post']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for fetching and manipulating nodes metadata.
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export abstract class NodeAPIServiceBase<
    T extends EncryptedNode = EncryptedNode,
    TMetadataResponseLink extends { Link: { LinkID: string } } = { Link: { LinkID: string } },
> {
    constructor(
        protected logger: Logger,
        protected apiService: DriveAPIService,
        protected clientUid: string | undefined,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.clientUid = clientUid;
    }

    async getNode(nodeUid: string, ownVolumeId: string | undefined, signal?: AbortSignal): Promise<T> {
        const nodesGenerator = this.iterateNodes([nodeUid], ownVolumeId, undefined, signal);
        const result = await nodesGenerator.next();
        if (!result.value) {
            throw new ValidationError(c('Error').t`Node not found`);
        }
        await nodesGenerator.return('finish');
        return result.value;
    }

    async *iterateNodes(
        nodeUids: string[],
        ownVolumeId: string | undefined,
        filterOptions?: FilterOptions,
        signal?: AbortSignal,
    ): AsyncGenerator<T> {
        const allNodeIds = nodeUids.map(splitNodeUid);

        const nodeIdsByVolumeId = new Map<string, string[]>();
        for (const { volumeId, nodeId } of allNodeIds) {
            if (!nodeIdsByVolumeId.has(volumeId)) {
                nodeIdsByVolumeId.set(volumeId, []);
            }
            nodeIdsByVolumeId.get(volumeId)?.push(nodeId);
        }

        // If the API returns node that is not recognised, it is returned as
        // an error, but first all nodes that are recognised are yielded.
        // Thus we capture all errors and throw them at the end of iteration.
        const errors: unknown[] = [];

        const iterateNodesPerVolume = this.iterateNodesPerVolume.bind(this);
        const iterateNodesPerVolumeGenerator = async function* () {
            for (const [volumeId, nodeIds] of nodeIdsByVolumeId.entries()) {
                const isAdmin = volumeId === ownVolumeId;

                yield (async function* () {
                    const errorsPerVolume = yield* iterateNodesPerVolume(
                        volumeId,
                        nodeIds,
                        isAdmin,
                        filterOptions,
                        signal,
                    );
                    if (errorsPerVolume.length) {
                        errors.push(...errorsPerVolume);
                    }
                })();
            }
        };

        yield* asyncIteratorRace(iterateNodesPerVolumeGenerator(), API_CONCURRENCY);

        if (errors.length) {
            this.logger.warn(`Failed to load ${errors.length} nodes`);
            throw new ProtonDriveError(c('Error').t`Failed to load some nodes`, { cause: errors });
        }
    }

    protected async *iterateNodesPerVolume(
        volumeId: string,
        nodeIds: string[],
        isOwnVolumeId: boolean,
        filterOptions?: FilterOptions,
        signal?: AbortSignal,
    ): AsyncGenerator<T, unknown[]> {
        const errors: unknown[] = [];

        for (const nodeIdsBatch of batch(nodeIds, API_NODES_BATCH_SIZE)) {
            const responseLinks = await this.fetchNodeMetadata(volumeId, nodeIdsBatch, signal);

            for (const link of responseLinks) {
                try {
                    const encryptedNode = this.linkToEncryptedNode(volumeId, link, isOwnVolumeId);
                    if (filterOptions?.type && encryptedNode.type !== filterOptions.type) {
                        continue;
                    }
                    yield encryptedNode;
                } catch (error: unknown) {
                    this.logger.error(`Failed to transform node ${link.Link.LinkID}`, error);
                    errors.push(error);
                }
            }
        }

        return errors;
    }

    protected abstract fetchNodeMetadata(
        volumeId: string,
        linkIds: string[],
        signal?: AbortSignal,
    ): Promise<TMetadataResponseLink[]>;

    protected abstract linkToEncryptedNode(volumeId: string, link: TMetadataResponseLink, isOwnVolumeId: boolean): T;

    // Improvement requested: load next page sooner before all IDs are yielded.
    async *iterateChildrenNodeUids(
        parentNodeUid: string,
        onlyFolders: boolean = false,
        signal?: AbortSignal,
    ): AsyncGenerator<string> {
        const { volumeId, nodeId } = splitNodeUid(parentNodeUid);

        let anchor = '';
        while (true) {
            const queryParams = new URLSearchParams();
            if (onlyFolders) {
                queryParams.set('FoldersOnly', '1');
            }
            if (anchor) {
                queryParams.set('AnchorID', anchor);
            }

            const response = await this.apiService.get<GetChildrenResponse>(
                `drive/v2/volumes/${volumeId}/folders/${nodeId}/children?${queryParams.toString()}`,
                signal,
            );
            for (const linkID of response.LinkIDs) {
                yield makeNodeUid(volumeId, linkID);
            }

            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    // Improvement requested: load next page sooner before all IDs are yielded.
    async *iterateTrashedNodeUids(volumeId: string, signal?: AbortSignal): AsyncGenerator<string> {
        let page = 0;
        while (true) {
            const response = await this.apiService.get<GetTrashedNodesResponse>(
                `drive/volumes/${volumeId}/trash?Page=${page}`,
                signal,
            );

            // The API returns items per shares which is not straightforward to
            // count if there is another page. We had mistakes in the past, thus
            // we rather end when the page is fully empty.
            // The new API endpoint should not split per shares anymore and adopt
            // the new pagination model with More/Anchor. For now, this is not
            // the most efficient way, but should be with us only for a short time.
            let hasItems = false;

            for (const linksPerShare of response.Trash) {
                for (const linkId of linksPerShare.LinkIDs) {
                    yield makeNodeUid(volumeId, linkId);
                    hasItems = true;
                }
            }

            if (!hasItems) {
                break;
            }
            page++;
        }
    }

    async renameNode(
        nodeUid: string,
        originalNode: {
            hash?: string;
        },
        newNode: {
            encryptedName: string;
            nameSignatureEmail: string | AnonymousUser;
            hash?: string;
        },
        signal?: AbortSignal,
    ): Promise<void> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);

        try {
            await this.apiService.put<
                Omit<PutRenameNodeRequest, 'SignatureAddress' | 'MIMEType'>,
                PutRenameNodeResponse
            >(
                `drive/v2/volumes/${volumeId}/links/${nodeId}/rename`,
                {
                    Name: newNode.encryptedName,
                    NameSignatureEmail: newNode.nameSignatureEmail,
                    Hash: newNode.hash,
                    OriginalHash: originalNode.hash || null,
                },
                signal,
            );
        } catch (error: unknown) {
            // API returns generic code 2000 when node is out of sync.
            // We map this to specific error for clarity.
            if (error instanceof InvalidRequirementsAPIError) {
                throw new NodeOutOfSyncError(error.message, error.code, { cause: error });
            }
            throw error;
        }
    }

    async moveNode(
        nodeUid: string,
        oldNode: {
            hash: string;
        },
        newNode: {
            parentUid: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature?: string;
            signatureEmail?: string | AnonymousUser;
            encryptedName: string;
            nameSignatureEmail?: string | AnonymousUser;
            hash: string;
            contentHash?: string;
        },
        signal?: AbortSignal,
    ): Promise<void> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { nodeId: newParentNodeId } = splitNodeUid(newNode.parentUid);

        try {
            await this.apiService.put<Omit<PutMoveNodeRequest, 'SignatureAddress' | 'MIMEType'>, PutMoveNodeResponse>(
                `drive/v2/volumes/${volumeId}/links/${nodeId}/move`,
                {
                    ParentLinkID: newParentNodeId,
                    NodePassphrase: newNode.armoredNodePassphrase,
                    // @ts-expect-error: API accepts NodePassphraseSignature as optional.
                    NodePassphraseSignature: newNode.armoredNodePassphraseSignature,
                    // @ts-expect-error: API accepts SignatureEmail as optional.
                    SignatureEmail: newNode.signatureEmail,
                    Name: newNode.encryptedName,
                    // @ts-expect-error: API accepts NameSignatureEmail as optional.
                    NameSignatureEmail: newNode.nameSignatureEmail,
                    Hash: newNode.hash,
                    OriginalHash: oldNode.hash,
                    ContentHash: newNode.contentHash || null,
                },
                signal,
            );
        } catch (error: unknown) {
            handleNodeWithSameNameExistsValidationError(volumeId, error);
            throw error;
        }
    }

    async copyNode(
        nodeUid: string,
        newNode: {
            parentUid: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature?: string;
            signatureEmail?: string | AnonymousUser;
            encryptedName: string;
            nameSignatureEmail?: string | AnonymousUser;
            hash: string;
        },
        signal?: AbortSignal,
    ): Promise<string> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { volumeId: parentVolumeId, nodeId: parentNodeId } = splitNodeUid(newNode.parentUid);

        let response: PostCopyNodeResponse;
        try {
            response = await this.apiService.post<PostCopyNodeRequest, PostCopyNodeResponse>(
                `drive/volumes/${volumeId}/links/${nodeId}/copy`,
                {
                    TargetVolumeID: parentVolumeId,
                    TargetParentLinkID: parentNodeId,
                    NodePassphrase: newNode.armoredNodePassphrase,
                    // @ts-expect-error: API accepts NodePassphraseSignature as optional.
                    NodePassphraseSignature: newNode.armoredNodePassphraseSignature,
                    // @ts-expect-error: API accepts SignatureEmail as optional.
                    SignatureEmail: newNode.signatureEmail,
                    Name: newNode.encryptedName,
                    // @ts-expect-error: API accepts NameSignatureEmail as optional.
                    NameSignatureEmail: newNode.nameSignatureEmail,
                    Hash: newNode.hash,
                },
                signal,
            );
        } catch (error: unknown) {
            handleNodeWithSameNameExistsValidationError(volumeId, error);
            throw error;
        }

        return makeNodeUid(volumeId, response.LinkID);
    }

    async *trashNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const { volumeId, batchNodeIds, batchNodeUids } of groupNodeUidsByVolumeAndIteratePerBatch(nodeUids)) {
            const response = await this.apiService.post<PostTrashNodesRequest, PostTrashNodesResponse>(
                `drive/v2/volumes/${volumeId}/trash_multiple`,
                {
                    LinkIDs: batchNodeIds,
                },
                signal,
            );

            // TODO: remove `as` when backend fixes OpenAPI schema.
            yield* handleResponseErrors(batchNodeUids, volumeId, response.Responses as LinkResponse[]);
        }
    }

    async emptyTrash(volumeId: string): Promise<void> {
        await this.apiService.delete<EmptyTrashResponse>(`drive/volumes/${volumeId}/trash`);
    }

    async *restoreNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const { volumeId, batchNodeIds, batchNodeUids } of groupNodeUidsByVolumeAndIteratePerBatch(nodeUids)) {
            const response = await this.apiService.put<PutRestoreNodesRequest, PutRestoreNodesResponse>(
                `drive/v2/volumes/${volumeId}/trash/restore_multiple`,
                {
                    LinkIDs: batchNodeIds,
                },
                signal,
            );

            // TODO: remove `as` when backend fixes OpenAPI schema.
            yield* handleResponseErrors(batchNodeUids, volumeId, response.Responses as LinkResponse[]);
        }
    }

    async *deleteTrashedNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const { volumeId, batchNodeIds, batchNodeUids } of groupNodeUidsByVolumeAndIteratePerBatch(nodeUids)) {
            const response = await this.apiService.post<PostDeleteTrashedNodesRequest, PostDeleteTrashedNodesResponse>(
                `drive/v2/volumes/${volumeId}/trash/delete_multiple`,
                {
                    LinkIDs: batchNodeIds,
                },
                signal,
            );

            // TODO: remove `as` when backend fixes OpenAPI schema.
            yield* handleResponseErrors(batchNodeUids, volumeId, response.Responses as LinkResponse[]);
        }
    }

    async *deleteMyNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const { volumeId, batchNodeIds, batchNodeUids } of groupNodeUidsByVolumeAndIteratePerBatch(nodeUids)) {
            const response = await this.apiService.post<PostDeleteMyNodesRequest, PostDeleteMyNodesResponse>(
                `drive/v2/volumes/${volumeId}/remove-mine`,
                {
                    LinkIDs: batchNodeIds,
                },
                signal,
            );

            // TODO: remove `as` when backend fixes OpenAPI schema.
            yield* handleResponseErrors(batchNodeUids, volumeId, response.Responses as LinkResponse[]);
        }
    }

    async createFolder(
        parentUid: string,
        newNode: {
            armoredKey: string;
            armoredHashKey: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature: string;
            signatureEmail: string | AnonymousUser;
            encryptedName: string;
            hash: string;
            armoredExtendedAttributes?: string;
        },
    ): Promise<string> {
        const { volumeId, nodeId: parentId } = splitNodeUid(parentUid);

        let response: PostCreateFolderResponse;
        try {
            response = await this.apiService.post<PostCreateFolderRequest, PostCreateFolderResponse>(
                `drive/v2/volumes/${volumeId}/folders`,
                {
                    ParentLinkID: parentId,
                    NodeKey: newNode.armoredKey,
                    NodeHashKey: newNode.armoredHashKey,
                    NodePassphrase: newNode.armoredNodePassphrase,
                    NodePassphraseSignature: newNode.armoredNodePassphraseSignature,
                    SignatureEmail: newNode.signatureEmail,
                    Name: newNode.encryptedName,
                    Hash: newNode.hash,
                    // @ts-expect-error: XAttr is optional as undefined.
                    XAttr: newNode.armoredExtendedAttributes,
                },
            );
        } catch (error: unknown) {
            handleNodeWithSameNameExistsValidationError(volumeId, error);
            throw error;
        }

        return makeNodeUid(volumeId, response.Folder.ID);
    }

    async getRevision(nodeRevisionUid: string, signal?: AbortSignal): Promise<EncryptedRevision> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        const response = await this.apiService.get<GetRevisionResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}?NoBlockUrls=true`,
            signal,
        );
        return transformRevisionResponse(volumeId, nodeId, response.Revision);
    }

    async getRevisions(nodeUid: string, signal?: AbortSignal): Promise<EncryptedRevision[]> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);

        const response = await this.apiService.get<GetRevisionsResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions`,
            signal,
        );
        return response.Revisions.filter(
            (revision) => revision.State === APIRevisionState.Active || revision.State === APIRevisionState.Obsolete,
        ).map((revision) => transformRevisionResponse(volumeId, nodeId, revision));
    }

    async restoreRevision(nodeRevisionUid: string): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        await this.apiService.post<undefined, PostRestoreRevisionResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}/restore`,
        );
    }

    async deleteRevision(nodeRevisionUid: string): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        await this.apiService.delete<DeleteRevisionResponse>(
            `drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`,
        );
    }

    async checkAvailableHashes(
        parentNodeUid: string,
        hashes: string[],
    ): Promise<{
        availableHashes: string[];
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
            availableHashes: result.AvailableHashes,
            pendingHashes: result.PendingHashes.map((hash) => ({
                hash: hash.Hash,
                nodeUid: makeNodeUid(volumeId, hash.LinkID),
                revisionUid: makeNodeRevisionUid(volumeId, hash.LinkID, hash.RevisionID),
                clientUid: hash.ClientUID || undefined,
            })),
        };
    }
}

export class NodeAPIService extends NodeAPIServiceBase {
    constructor(logger: Logger, apiService: DriveAPIService, clientUid: string | undefined) {
        super(logger, apiService, clientUid);
    }

    protected async fetchNodeMetadata(
        volumeId: string,
        linkIds: string[],
        signal?: AbortSignal,
    ): Promise<PostLoadLinksMetadataResponse['Links']> {
        const response = await this.apiService.post<PostLoadLinksMetadataRequest, PostLoadLinksMetadataResponse>(
            `drive/v2/volumes/${volumeId}/links`,
            {
                LinkIDs: linkIds,
            },
            signal,
        );
        return response.Links;
    }

    protected linkToEncryptedNode(
        volumeId: string,
        link: PostLoadLinksMetadataResponse['Links'][0],
        isOwnVolumeId: boolean,
    ): EncryptedNode {
        return linkToEncryptedNode(this.logger, volumeId, link, isOwnVolumeId);
    }
}

type LinkResponse = {
    LinkID: string;
    Response: {
        Code?: number;
        Error?: string;
    };
};

function* handleResponseErrors(
    nodeUids: string[],
    volumeId: string,
    responses: LinkResponse[] = [],
): Generator<NodeResult> {
    const errors = new Map();

    responses.forEach((response) => {
        if (!response.Response.Code || !isCodeOk(response.Response.Code) || response.Response.Error) {
            const nodeUid = makeNodeUid(volumeId, response.LinkID);
            errors.set(nodeUid, response.Response.Error || c('Error').t`Unknown error ${response.Response.Code}`);
        }
    });

    for (const uid of nodeUids) {
        const error = errors.get(uid);
        if (error) {
            yield { uid, ok: false, error };
        } else {
            yield { uid, ok: true };
        }
    }
}

function handleNodeWithSameNameExistsValidationError(volumeId: string, error: unknown): void {
    if (error instanceof ValidationError) {
        if (error.code === ErrorCode.ALREADY_EXISTS) {
            const typedDetails = error.details as
                | {
                      ConflictLinkID: string;
                  }
                | undefined;

            const existingNodeUid = typedDetails?.ConflictLinkID
                ? makeNodeUid(volumeId, typedDetails.ConflictLinkID)
                : undefined;

            throw new NodeWithSameNameExistsValidationError(error.message, error.code, existingNodeUid);
        }
    }
}

export function linkToEncryptedNode(
    logger: Logger,
    volumeId: string,
    link: Pick<PostLoadLinksMetadataResponse['Links'][0], 'Link' | 'Membership' | 'Sharing' | 'Folder' | 'File'>,
    isAdmin: boolean,
): EncryptedNode {
    const { baseNodeMetadata, baseCryptoNodeMetadata } = linkToEncryptedNodeBaseMetadata(
        logger,
        volumeId,
        link,
        isAdmin,
    );

    if (link.Link.Type === 1 && link.Folder) {
        return {
            ...baseNodeMetadata,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
                folder: {
                    armoredExtendedAttributes: link.Folder.XAttr || undefined,
                    armoredHashKey: link.Folder.NodeHashKey as string,
                },
            },
        };
    }

    if (link.Link.Type === 2 && link.File && link.File.ActiveRevision) {
        return {
            ...baseNodeMetadata,
            totalStorageSize: link.File.TotalEncryptedSize,
            mediaType: link.File.MediaType || undefined,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
                file: {
                    base64ContentKeyPacket: link.File.ContentKeyPacket,
                    armoredContentKeyPacketSignature: link.File.ContentKeyPacketSignature || undefined,
                },
                activeRevision: {
                    uid: makeNodeRevisionUid(volumeId, link.Link.LinkID, link.File.ActiveRevision.RevisionID),
                    state: RevisionState.Active,
                    creationTime: new Date(link.File.ActiveRevision.CreateTime * 1000),
                    storageSize: link.File.ActiveRevision.EncryptedSize,
                    signatureEmail: link.File.ActiveRevision.SignatureEmail || undefined,
                    armoredExtendedAttributes: link.File.ActiveRevision.XAttr || undefined,
                    thumbnails:
                        link.File.ActiveRevision.Thumbnails?.map((thumbnail) =>
                            transformThumbnail(volumeId, link.Link.LinkID, thumbnail),
                        ) || [],
                },
            },
        };
    }

    // TODO: Remove this once client do not use main SDK for photos.
    // At the beginning, the client used main SDK for some photo actions.
    // This was a temporary solution before the Photos SDK was implemented.
    // Now the client must use Photos SDK for all photo-related actions.
    // Knowledge of albums in main SDK is deprecated and will be removed.
    if (link.Link.Type === 3) {
        return {
            ...baseNodeMetadata,
            encryptedCrypto: {
                ...baseCryptoNodeMetadata,
            },
        };
    }

    throw new Error(`Unknown node type: ${link.Link.Type}`);
}

export function linkToEncryptedNodeBaseMetadata(
    logger: Logger,
    volumeId: string,
    link: Pick<PostLoadLinksMetadataResponse['Links'][0], 'Link' | 'Membership' | 'Sharing'>,
    isAdmin: boolean,
) {
    const membershipRole = permissionsToMemberRole(logger, link.Membership?.Permissions);

    const baseNodeMetadata = {
        // Internal metadata
        hash: link.Link.NameHash || undefined,
        encryptedName: link.Link.Name,

        // Basic node metadata
        uid: makeNodeUid(volumeId, link.Link.LinkID),
        parentUid: link.Link.ParentLinkID ? makeNodeUid(volumeId, link.Link.ParentLinkID) : undefined,
        type: nodeTypeNumberToNodeType(logger, link.Link.Type),
        creationTime: new Date(link.Link.CreateTime * 1000),
        modificationTime: new Date(link.Link.ModifyTime * 1000),
        trashTime: link.Link.TrashTime ? new Date(link.Link.TrashTime * 1000) : undefined,

        // Sharing node metadata
        shareId: link.Sharing?.ShareID || undefined,
        isShared: !!link.Sharing,
        isSharedPublicly: !!link.Sharing?.ShareURLID,
        directRole: isAdmin ? MemberRole.Admin : membershipRole,
        membership: link.Membership
            ? {
                  role: membershipRole,
                  inviteTime: new Date(link.Membership.InviteTime * 1000),
              }
            : undefined,
    };

    const baseCryptoNodeMetadata = {
        signatureEmail: link.Link.SignatureEmail || undefined,
        nameSignatureEmail: link.Link.NameSignatureEmail || undefined,
        armoredKey: link.Link.NodeKey,
        armoredNodePassphrase: link.Link.NodePassphrase,
        armoredNodePassphraseSignature: link.Link.NodePassphraseSignature,
        membership: link.Membership
            ? {
                  inviterEmail: link.Membership.InviterEmail,
                  base64MemberSharePassphraseKeyPacket: link.Membership.MemberSharePassphraseKeyPacket,
                  armoredInviterSharePassphraseKeyPacketSignature:
                      link.Membership.InviterSharePassphraseKeyPacketSignature,
                  armoredInviteeSharePassphraseSessionKeySignature:
                      link.Membership.InviteeSharePassphraseSessionKeySignature,
              }
            : undefined,
    };

    return {
        baseNodeMetadata,
        baseCryptoNodeMetadata,
    };
}

export function* groupNodeUidsByVolumeAndIteratePerBatch(
    nodeUids: string[],
): Generator<{ volumeId: string; batchNodeIds: string[]; batchNodeUids: string[] }> {
    const allNodeIds = nodeUids.map((nodeUid: string) => {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        return { volumeId, nodeIds: { nodeId, nodeUid } };
    });

    const nodeIdsByVolumeId = new Map<string, { nodeId: string; nodeUid: string }[]>();
    for (const { volumeId, nodeIds } of allNodeIds) {
        if (!nodeIdsByVolumeId.has(volumeId)) {
            nodeIdsByVolumeId.set(volumeId, []);
        }
        nodeIdsByVolumeId.get(volumeId)?.push(nodeIds);
    }

    for (const [volumeId, nodeIds] of nodeIdsByVolumeId.entries()) {
        for (const nodeIdsBatch of batch(nodeIds, API_NODES_BATCH_SIZE)) {
            yield {
                volumeId,
                batchNodeIds: nodeIdsBatch.map(({ nodeId }) => nodeId),
                batchNodeUids: nodeIdsBatch.map(({ nodeUid }) => nodeUid),
            };
        }
    }
}

function transformRevisionResponse(
    volumeId: string,
    nodeId: string,
    revision: GetRevisionResponse['Revision'] | GetRevisionsResponse['Revisions'][0],
): EncryptedRevision {
    return {
        uid: makeNodeRevisionUid(volumeId, nodeId, revision.ID),
        state: revision.State === APIRevisionState.Active ? RevisionState.Active : RevisionState.Superseded,
        // @ts-expect-error: API doc is wrong, CreateTime is not optional.
        creationTime: new Date(revision.CreateTime * 1000),
        storageSize: revision.Size,
        signatureEmail: revision.SignatureEmail || undefined,
        armoredExtendedAttributes: revision.XAttr || undefined,
        thumbnails: revision.Thumbnails?.map((thumbnail) => transformThumbnail(volumeId, nodeId, thumbnail)) || [],
    };
}

function transformThumbnail(
    volumeId: string,
    nodeId: string,
    thumbnail: { ThumbnailID: string | null; Type: 1 | 2 | 3 },
): Thumbnail {
    return {
        // TODO: Legacy thumbnails didn't have ID but we don't have them anymore. Remove typing once API doc is updated.
        uid: makeNodeThumbnailUid(volumeId, nodeId, thumbnail.ThumbnailID as string),
        // TODO: We don't support any other thumbnail type yet.
        type: thumbnail.Type as 1 | 2,
    };
}
