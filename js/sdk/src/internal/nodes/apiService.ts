import { Logger, NodeResult } from "../../interface";
import { RevisionState } from "../../interface/nodes";
import { DriveAPIService, drivePaths, ErrorCode, nodeTypeNumberToNodeType, permissionsToDirectMemberRole } from "../apiService";
import { splitNodeUid, makeNodeUid, makeNodeRevisionUid, splitNodeRevisionUid } from "../uids";
import { EncryptedNode, EncryptedRevision } from "./interface";

type PostLoadLinksMetadataRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostLoadLinksMetadataResponse = drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['responses']['200']['content']['application/json'];

type GetChildrenResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/children']['get']['responses']['200']['content']['application/json'];

type GetTrashedNodesResponse = drivePaths['/drive/volumes/{volumeID}/trash']['get']['responses']['200']['content']['application/json'];

type PutRenameNodeRequest = Extract<drivePaths['/drive/v2/volumes/{volumeId}/links/{linkID}/rename']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutRenameNodeResponse = drivePaths['/drive/v2/volumes/{volumeId}/links/{linkID}/rename']['put']['responses']['200']['content']['application/json'];

type PutMoveNodeRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutMoveNodeResponse = drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['responses']['200']['content']['application/json'];

type PostTrashNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/trash_multiple']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostTrashNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/trash_multiple']['post']['responses']['200']['content']['application/json'];

type PutRestoreNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutRestoreNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['responses']['200']['content']['application/json'];

type PostDeleteNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostDeleteNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['responses']['200']['content']['application/json'];

type PostCreateFolderRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateFolderResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['responses']['200']['content']['application/json'];

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
    constructor(private apiService: DriveAPIService, private logger?: Logger) {
        this.apiService = apiService;
        this.logger = logger;
    }

    async getNode(nodeUid: string, signal?: AbortSignal): Promise<EncryptedNode> {
        const nodes = await this.getNodes([nodeUid], signal);
        return nodes[0];
    }

    // Improvement requested: support multiple volumes.
    async getNodes(nodeUids: string[], signal?: AbortSignal): Promise<EncryptedNode[]> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId("getNodes", nodeIds);

        const response = await this.apiService.post<PostLoadLinksMetadataRequest, PostLoadLinksMetadataResponse>(`drive/v2/volumes/${volumeId}/links`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        const nodes = response.Links.map((link) => {
            const baseNodeMetadata = {
                // Internal metadata
                hash: link.Link.NameHash || undefined,
                encryptedName: link.Link.Name,

                // Basic node metadata
                uid: makeNodeUid(volumeId, link.Link.LinkID),
                parentUid: link.Link.ParentLinkID ? makeNodeUid(volumeId, link.Link.ParentLinkID) : undefined,
                type: nodeTypeNumberToNodeType(link.Link.Type),
                mimeType: link.Link.MIMEType || undefined,
                createdDate: new Date(link.Link.CreateTime*1000),
                trashedDate: link.Link.TrashTime ? new Date(link.Link.TrashTime*1000) : undefined,

                // Sharing node metadata
                shareId: link.SharingSummary?.ShareID || undefined,
                isShared: !!link.SharingSummary,
                directMemberRole: permissionsToDirectMemberRole(link.SharingSummary?.ShareAccess.Permissions, this.logger),
            }
            const baseCryptoNodeMetadata = {
                signatureEmail: link.Link.SignatureEmail || undefined,
                nameSignatureEmail: link.Link.NameSignatureEmail || undefined,
                armoredKey: link.Link.NodeKey,
                armoredNodePassphrase: link.Link.NodePassphrase,
                armoredNodePassphraseSignature: link.Link.NodePassphraseSignature,
            }

            if (link.Link.Type === 2 && link.File && link.ActiveRevision) {
                return {
                    ...baseNodeMetadata,
                    encryptedCrypto: {
                        ...baseCryptoNodeMetadata,
                        file: {
                            base64ContentKeyPacket: link.File.ContentKeyPacket,
                            armoredContentKeyPacketSignature: link.File.ContentKeyPacketSignature || undefined,
                        },
                        activeRevision: {
                            uid: makeNodeRevisionUid(volumeId, link.Link.LinkID, link.ActiveRevision.RevisionID),
                            state: RevisionState.Active,
                            createdDate: new Date(link.ActiveRevision.CreateTime*1000),
                            signatureEmail: link.ActiveRevision.SignatureEmail || undefined,
                            encryptedExtendedAttributes: link.ActiveRevision.XAttr || undefined,
                        },
                    },
                }
            }
            if (link.Link.Type === 1 && link.Folder) {
                return {
                    ...baseNodeMetadata,
                    encryptedCrypto: {
                        ...baseCryptoNodeMetadata,
                        folder: {
                            encryptedExtendedAttributes: link.Folder.XAttr || undefined,
                            armoredHashKey: link.Folder.NodeHashKey as string,
                        },
                    },
                }
            }
            throw new Error(`Unknown node type: ${link.Link.Type}`);
        });
        return nodes;
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
            hash: string,
        },
        newNode: {
            encryptedName: string,
            nameSignatureEmail: string,
            hash: string,
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
            OriginalHash: originalNode.hash,
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
        const volumeId = assertAndGetSingleVolumeId("trashNodes", nodeIds);

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
        const volumeId = assertAndGetSingleVolumeId("restoreNodes", nodeIds);

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
        const volumeId = assertAndGetSingleVolumeId("deleteNodes", nodeIds);

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
            encryptedExtendedAttributes?: string,
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
            // @ts-expect-error: API accepts XAttr as optional.
            XAttr: newNode.encryptedExtendedAttributes,
        });

        return response.Folder.ID;
    }

    async getRevisions(nodeUid: string, signal?: AbortSignal): Promise<EncryptedRevision[]> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);

        const response = await this.apiService.get<GetRevisionsResponse>(`drive/v2/volumes/${volumeId}/files/${nodeId}/revisions`, signal);
        return response.Revisions
            .filter((revision) => revision.State === APIRevisionState.Active || revision.State === APIRevisionState.Obsolete)
            .map((revision) => ({
                uid: makeNodeRevisionUid(volumeId, nodeId, revision.ID),
                state: revision.State === APIRevisionState.Active ? RevisionState.Active : RevisionState.Superseded,
                createdDate: new Date(revision.CreateTime*1000),
                signatureEmail: revision.SignatureEmail || undefined,
                encryptedExtendedAttributes: revision.XAttr || undefined,
            }));
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
        throw new Error(`${operationForErrorMessage} does not support multiple volumes`);
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
        const okResponse = response.Response.Code === ErrorCode.OK || response.Response.Code === ErrorCode.OK_MANY;
        if (!okResponse || response.Response.Error) {
            const nodeUid = makeNodeUid(volumeId, response.LinkID);
            errors.set(nodeUid, response.Response.Error || 'Unknown error');
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
