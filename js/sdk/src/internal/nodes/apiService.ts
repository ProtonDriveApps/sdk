import { c } from "ttag";

import { ProtonDriveError, ValidationError } from "../../errors";
import { Logger, NodeResult } from "../../interface";
import { MemberRole, RevisionState } from "../../interface/nodes";
import { DriveAPIService, drivePaths, isCodeOk, nodeTypeNumberToNodeType, permissionsToDirectMemberRole } from "../apiService";
import { splitNodeUid, makeNodeUid, makeNodeRevisionUid, splitNodeRevisionUid, makeNodeThumbnailUid } from "../uids";
import { EncryptedNode, EncryptedRevision, Thumbnail } from "./interface";

type PostLoadLinksMetadataRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostLoadLinksMetadataResponse = drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['responses']['200']['content']['application/json'];

type GetChildrenResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/children']['get']['responses']['200']['content']['application/json'];

type GetTrashedNodesResponse = drivePaths['/drive/volumes/{volumeID}/trash']['get']['responses']['200']['content']['application/json'];

type PutRenameNodeRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/rename']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutRenameNodeResponse = drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/rename']['put']['responses']['200']['content']['application/json'];

type PutMoveNodeRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutMoveNodeResponse = drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['responses']['200']['content']['application/json'];

type PostTrashNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash_multiple']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostTrashNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash_multiple']['post']['responses']['200']['content']['application/json'];

type PutRestoreNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutRestoreNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['responses']['200']['content']['application/json'];

type PostDeleteNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostDeleteNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['responses']['200']['content']['application/json'];

type PostCreateFolderRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateFolderResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['responses']['200']['content']['application/json'];

type GetRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['get']['responses']['200']['content']['application/json'];
type GetRevisionsResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions']['get']['responses']['200']['content']['application/json'];
enum APIRevisionState {
    Draft = 0,
    Active = 1,
    Obsolete = 2,
}

type PostRestoreRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}/restore']['post']['responses']['202']['content']['application/json'];

type DeleteRevisionResponse = drivePaths['/drive/v2/volumes/{volumeID}/files/{linkID}/revisions/{revisionID}']['delete']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for fetching and manipulating nodes metadata.
 * 
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class NodeAPIService {
    constructor(private logger: Logger, private apiService: DriveAPIService) {
        this.logger = logger;
        this.apiService = apiService;
    }

    async getNode(nodeUid: string, ownVolumeId: string, signal?: AbortSignal): Promise<EncryptedNode> {
        const nodesGenerator = this.iterateNodes([nodeUid], ownVolumeId, signal);
        const result = await nodesGenerator.next();
        await nodesGenerator.return("finish");
        return result.value;
    }

    // Improvement requested: split into multiple calls for many nodes.
    async* iterateNodes(nodeUids: string[], ownVolumeId: string, signal?: AbortSignal): AsyncGenerator<EncryptedNode> {
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
        const errors = [];

        for (const [volumeId, nodeIds] of nodeIdsByVolumeId.entries()) {
            const isAdmin = volumeId === ownVolumeId;

            const response = await this.apiService.post<PostLoadLinksMetadataRequest, PostLoadLinksMetadataResponse>(`drive/v2/volumes/${volumeId}/links`, {
                LinkIDs: nodeIds,
            }, signal);

            for (const link of response.Links) {
                try {
                    yield linkToEncryptedNode(this.logger, volumeId, link, isAdmin);
                } catch (error: unknown) {
                    this.logger.error(`Failed to transform node ${link.Link.LinkID}`, error);
                    errors.push(error);
                }
            }
        }


        if (errors.length) {
            this.logger.warn(`Failed to load ${errors.length} nodes`);
            throw new ProtonDriveError(c('Error').t`Failed to load some nodes`, { cause: errors });
        }
    }

    // Improvement requested: load next page sooner before all IDs are yielded.
    async *iterateChildrenNodeUids(parentNodeUid: string, signal?: AbortSignal): AsyncGenerator<string> {
        const { volumeId, nodeId } = splitNodeUid(parentNodeUid);

        let anchor = "";
        while (true) {
            const response = await this.apiService.get<GetChildrenResponse>(`drive/v2/volumes/${volumeId}/folders/${nodeId}/children?${anchor ? `AnchorID=${anchor}` : ''}`, signal);
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
            const response = await this.apiService.get<GetTrashedNodesResponse>(`drive/volumes/${volumeId}/trash?Page=${page}`, signal);
            
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
            hash?: string,
        },
        newNode: {
            encryptedName: string,
            nameSignatureEmail: string,
            hash?: string,
        },
        signal?: AbortSignal,
    ): Promise<void> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);

        await this.apiService.put<
            Omit<PutRenameNodeRequest, "SignatureAddress" | "MIMEType">,
            PutRenameNodeResponse
        >(`drive/v2/volumes/${volumeId}/links/${nodeId}/rename`, {
            Name: newNode.encryptedName,
            NameSignatureEmail: newNode.nameSignatureEmail,
            Hash: newNode.hash,
            OriginalHash: originalNode.hash || null,
        }, signal);
    }

    async moveNode(
        nodeUid: string,
        oldNode: {
            hash: string,
        },
        newNode: {
            parentUid: string,
            armoredNodePassphrase: string,
            armoredNodePassphraseSignature?: string,
            signatureEmail?: string,
            encryptedName: string,
            nameSignatureEmail?: string,
            hash: string,
            contentHash?: string,
        },
        signal?: AbortSignal,
    ): Promise<void> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { nodeId: newParentNodeId } = splitNodeUid(newNode.parentUid);

        await this.apiService.put<
            Omit<PutMoveNodeRequest, "SignatureAddress" | "MIMEType">,
            PutMoveNodeResponse
        >(`drive/v2/volumes/${volumeId}/links/${nodeId}/move`, {
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
        }, signal);
    }

    // Improvement requested: split into multiple calls for many nodes.
    async* trashNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId(c('Operation').t`Trashing items`, nodeIds);

        const response = await this.apiService.post<
            PostTrashNodesRequest,
            PostTrashNodesResponse
        >(`drive/v2/volumes/${volumeId}/trash_multiple`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        // TODO: remove `as` when backend fixes OpenAPI schema.
        yield* handleResponseErrors(nodeUids, volumeId, response.Responses as LinkResponse[]);
    }

    // Improvement requested: split into multiple calls for many nodes.
    async* restoreNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId(c('Operation').t`Restoring items`, nodeIds);

        const response = await this.apiService.put<
            PutRestoreNodesRequest,
            PutRestoreNodesResponse
        >(`drive/v2/volumes/${volumeId}/trash/restore_multiple`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        // TODO: remove `as` when backend fixes OpenAPI schema.
        yield* handleResponseErrors(nodeUids, volumeId, response.Responses as LinkResponse[]);
    }

    // Improvement requested: split into multiple calls for many nodes.
    async* deleteNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId(c('Operation').t`Deleting items`, nodeIds);

        const response = await this.apiService.post<
            PostDeleteNodesRequest,
            PostDeleteNodesResponse
        >(`drive/v2/volumes/${volumeId}/trash/delete_multiple`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        // TODO: remove `as` when backend fixes OpenAPI schema.
        yield* handleResponseErrors(nodeUids, volumeId, response.Responses as LinkResponse[]);
    }

    async createFolder(
        parentUid: string,
        newNode: {
            armoredKey: string,
            armoredHashKey: string,
            armoredNodePassphrase: string,
            armoredNodePassphraseSignature: string,
            signatureEmail: string,
            encryptedName: string,
            hash: string,
            armoredExtendedAttributes?: string,
        },
    ): Promise<string> {
        const { volumeId, nodeId: parentId } = splitNodeUid(parentUid);

        const response = await this.apiService.post<
            PostCreateFolderRequest,
            PostCreateFolderResponse
        >(`drive/v2/volumes/${volumeId}/folders`, {
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
        });

        return makeNodeUid(volumeId, response.Folder.ID);
    }

    async getRevision(nodeRevisionUid: string, signal?: AbortSignal): Promise<EncryptedRevision> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        const response = await this.apiService.get<GetRevisionResponse>(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}?NoBlockUrls=true`, signal);
        return transformRevisionResponse(volumeId, nodeId, response.Revision);
    }

    async getRevisions(nodeUid: string, signal?: AbortSignal): Promise<EncryptedRevision[]> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);

        const response = await this.apiService.get<GetRevisionsResponse>(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions`, signal);
        return response.Revisions
            .filter((revision) => revision.State === APIRevisionState.Active || revision.State === APIRevisionState.Obsolete)
            .map((revision) => transformRevisionResponse(volumeId, nodeId, revision));
    }

    async restoreRevision(nodeRevisionUid: string): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        await this.apiService.post<
            undefined,
            PostRestoreRevisionResponse
        >(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}/restore`);
    }

    async deleteRevision(nodeRevisionUid: string): Promise<void> {
        const { volumeId, nodeId, revisionId } = splitNodeRevisionUid(nodeRevisionUid);

        await this.apiService.delete<DeleteRevisionResponse>(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions/${revisionId}`);
    }
}

function assertAndGetSingleVolumeId(operationForErrorMessage: string, nodeIds: { volumeId: string }[]): string {
    const uniqueVolumeIds = new Set(nodeIds.map(({ volumeId }) => volumeId));
    if (uniqueVolumeIds.size !== 1) {
        throw new ValidationError(c('Error').t`${operationForErrorMessage} from multiple sections is not allowed`);
    }
    const volumeId = nodeIds[0].volumeId;
    return volumeId;
}

type LinkResponse = {
    LinkID: string,
    Response: {
        Code?: number,
        Error?: string,
    }
};

function* handleResponseErrors(nodeUids: string[], volumeId: string, responses: LinkResponse[] = []): Generator<NodeResult> {
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

function linkToEncryptedNode(logger: Logger, volumeId: string, link: PostLoadLinksMetadataResponse['Links'][0], isAdmin: boolean): EncryptedNode {
    const baseNodeMetadata = {
        // Internal metadata
        hash: link.Link.NameHash || undefined,
        encryptedName: link.Link.Name,

        // Basic node metadata
        uid: makeNodeUid(volumeId, link.Link.LinkID),
        parentUid: link.Link.ParentLinkID ? makeNodeUid(volumeId, link.Link.ParentLinkID) : undefined,
        type: nodeTypeNumberToNodeType(logger, link.Link.Type),
        creationTime: new Date(link.Link.CreateTime*1000),
        trashTime: link.Link.TrashTime ? new Date(link.Link.TrashTime*1000) : undefined,

        // Sharing node metadata
        shareId: link.Sharing?.ShareID || undefined,
        isShared: !!link.Sharing,
        directMemberRole: isAdmin ? MemberRole.Admin : permissionsToDirectMemberRole(logger, link.Membership?.Permissions),
    }
    const baseCryptoNodeMetadata = {
        signatureEmail: link.Link.SignatureEmail || undefined,
        nameSignatureEmail: link.Link.NameSignatureEmail || undefined,
        armoredKey: link.Link.NodeKey,
        armoredNodePassphrase: link.Link.NodePassphrase,
        armoredNodePassphraseSignature: link.Link.NodePassphraseSignature,
    }

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
        }
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
                    creationTime: new Date(link.File.ActiveRevision.CreateTime*1000),
                    storageSize: link.File.ActiveRevision.EncryptedSize,
                    signatureEmail: link.File.ActiveRevision.SignatureEmail || undefined,
                    armoredExtendedAttributes: link.File.ActiveRevision.XAttr || undefined,
                    thumbnails: link.File.ActiveRevision.Thumbnails?.map((thumbnail) => transformThumbnail(volumeId, link.Link.LinkID, thumbnail)) || [],
                },
            },
        }
    }

    throw new Error(`Unknown node type: ${link.Link.Type}`);
}

function transformRevisionResponse(
    volumeId: string,
    nodeId: string,
    revision: GetRevisionResponse['Revision'] | GetRevisionsResponse['Revisions'][0],
): EncryptedRevision {
    return {
        uid: makeNodeRevisionUid(volumeId, nodeId, revision.ID),
        state: revision.State === APIRevisionState.Active ? RevisionState.Active : RevisionState.Superseded,
        creationTime: new Date(revision.CreateTime*1000),
        storageSize: revision.Size,
        signatureEmail: revision.SignatureEmail || undefined,
        armoredExtendedAttributes: revision.XAttr || undefined,
        thumbnails: revision.Thumbnails?.map((thumbnail) => transformThumbnail(volumeId, nodeId, thumbnail)) || [],
    }
}

function transformThumbnail(volumeId: string, nodeId: string, thumbnail: { ThumbnailID: string | null, Type: 1 | 2 | 3}): Thumbnail {
    return {
        // TODO: Legacy thumbnails didn't have ID but we don't have them anymore. Remove typing once API doc is updated.
        uid: makeNodeThumbnailUid(volumeId, nodeId, thumbnail.ThumbnailID as string),
        // TODO: We don't support any other thumbnail type yet.
        type: thumbnail.Type as 1 | 2,
    }
}
