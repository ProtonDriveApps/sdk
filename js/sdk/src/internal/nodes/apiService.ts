import { Logger, NodeType, MemberRole } from "../../interface";
import { DriveAPIService, drivePaths } from "../apiService";
import { splitNodeUid, makeNodeUid } from "./nodeUid";
import { EncryptedNode } from "./interface";

type PostLoadLinksMetadataRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['requestBody'], { 'content': any }>['content']['application/json'];
type PostLoadLinksMetadataResponse = drivePaths['/drive/v2/volumes/{volumeID}/links']['post']['responses']['200']['content']['application/json'];

type GetChildrenResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/children']['get']['responses']['200']['content']['application/json'];

type GetTrashedNodesResponse = drivePaths['/drive/volumes/{volumeID}/trash']['get']['responses']['200']['content']['application/json'];

type PutRenameNodeRequest = Extract<drivePaths['/drive/v2/volumes/{volumeId}/links/{linkID}/rename']['put']['requestBody'], { 'content': any }>['content']['application/json'];
type PutRenameNodeResponse = drivePaths['/drive/v2/volumes/{volumeId}/links/{linkID}/rename']['put']['responses']['200']['content']['application/json'];

type PutMoveNodeRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['requestBody'], { 'content': any }>['content']['application/json'];
type PutMoveNodeResponse = drivePaths['/drive/v2/volumes/{volumeID}/links/{linkID}/move']['put']['responses']['200']['content']['application/json'];

type PostTrashNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/trash_multiple']['post']['requestBody'], { 'content': any }>['content']['application/json'];
type PostTrashNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders/{linkID}/trash_multiple']['post']['responses']['200']['content']['application/json'];

type PutRestoreNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['requestBody'], { 'content': any }>['content']['application/json'];
type PutRestoreNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash/restore_multiple']['put']['responses']['200']['content']['application/json'];

type PostDeleteNodesRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['requestBody'], { 'content': any }>['content']['application/json'];
type PostDeleteNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/trash/delete_multiple']['post']['responses']['200']['content']['application/json'];

type PostCreateFolderRequest = Extract<drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['requestBody'], { 'content': any }>['content']['application/json'];
type PostCreateFolderResponse = drivePaths['/drive/v2/volumes/{volumeID}/folders']['post']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for fetching and manipulating nodes metadata.
 * 
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export function nodeAPIService(apiService: DriveAPIService, logger?: Logger) {
    async function getNode(nodeUid: string, signal?: AbortSignal): Promise<EncryptedNode> {
        const nodes = await getNodes([nodeUid], signal);
        return nodes[0];
    }

    // Improvement requested: support multiple volumes.
    async function getNodes(nodeUids: string[], signal?: AbortSignal): Promise<EncryptedNode[]> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId("getNodes", nodeIds);

        const response = await apiService.post<PostLoadLinksMetadataRequest, PostLoadLinksMetadataResponse>(`drive/volumes/${volumeId}/links`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        const nodes = response.Links.map((link) => {
            const baseNodeMetadata = {
                // Internal metadata
                volumeId,
                hash: link.Link.NameHash || undefined,

                // Basic node metadata
                uid: makeNodeUid(volumeId, link.Link.LinkID),
                parentUid: link.Link.ParentLinkID ? makeNodeUid(volumeId, link.Link.ParentLinkID) : undefined,
                type: link.Link.Type === 1 ? NodeType.File : NodeType.Folder,
                mimeType: link.Link.MIMEType || undefined,
                createdDate: new Date(link.Link.CreateTime),
                trashedDate: link.Link.TrashTime ? new Date(link.Link.TrashTime) : undefined,

                // Sharing node metadata
                shareId: link.SharingSummary?.ShareID || undefined,
                isShared: !!link.SharingSummary,
                directMemberRole: sharingSummaryToDirectMemberRole(link.SharingSummary, logger),
            }
            const baseCryptoNodeMetadata = {
                encryptedName: link.Link.Name,
                signatureEmail: link.Link.SignatureEmail || undefined,
                nameSignatureEmail: link.Link.NameSignatureEmail || undefined,
                armoredKey: link.Link.NodeKey,
                armoredNodePassphrase: link.Link.NodePassphrase,
                armoredNodePassphraseSignature: link.Link.NodePassphraseSignature,
            }

            if (link.Link.Type === 1 && link.File && link.ActiveRevision) {
                return {
                    ...baseNodeMetadata,
                    encryptedCrypto: {
                        ...baseCryptoNodeMetadata,
                        file: {
                            base64ContentKeyPacket: link.File.ContentKeyPacket,
                            armoredContentKeyPacketSignature: link.File.ContentKeyPacketSignature || undefined,
                        },
                        activeRevision: {
                            id: link.ActiveRevision.RevisionID,
                            encryptedExtendedAttributes: link.ActiveRevision.XAttr || undefined,
                        },
                    },
                }
            }
            if (link.Link.Type === 2 && link.Folder) {
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
    async function* iterateChildrenNodeUids(parentNodeUid: string, signal?: AbortSignal): AsyncGenerator<string> {
        const { volumeId, nodeId } = splitNodeUid(parentNodeUid);

        let anchor = "";
        while (true) {
            const response = await apiService.get<GetChildrenResponse>(`drive/volumes/${volumeId}/folders/${nodeId}/children?AnchorID=${anchor}`, signal);
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
    async function* iterateTrashedNodeUids(volumeId: string, signal?: AbortSignal): AsyncGenerator<string> {
        let page = 0;
        while (true) {
            const response = await apiService.get<GetTrashedNodesResponse>(`drive/volumes/${volumeId}/trash?Page=${page}`, signal);
            
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

    async function renameNode(
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

        await apiService.put<
            Omit<PutRenameNodeRequest, "SignatureAddress" | "MIMEType">,
            PutRenameNodeResponse
        >(`drive/v2/volumes/${volumeId}/links/${nodeId}/rename`, {
            Name: newNode.encryptedName,
            NameSignatureEmail: newNode.nameSignatureEmail,
            Hash: newNode.hash,
            OriginalHash: originalNode.hash,
        }, signal);
    }

    async function moveNode(
        nodeUid: string,
        oldNode: {
            hash: string,
        },
        newNode: {
            parentUid: string,
            armoredNodePassphrase: string,
            armoredNodePassphraseSignature?: string,
            signatureEmail: string,
            encryptedName: string,
            nameSignatureEmail: string,
            hash: string,
            contentHash?: string,
        },
        signal?: AbortSignal,
    ): Promise<void> {
        const { volumeId, nodeId } = splitNodeUid(nodeUid);
        const { nodeId: newParentNodeId } = splitNodeUid(newNode.parentUid);

        await apiService.put<
            Omit<PutMoveNodeRequest, "SignatureAddress" | "MIMEType">,
            PutMoveNodeResponse
        >(`/drive/v2/volumes/${volumeId}/links/${nodeId}/move`, {
            ParentLinkID: newParentNodeId,
            NodePassphrase: newNode.armoredNodePassphrase,
            NodePassphraseSignature: newNode.armoredNodePassphraseSignature || null,
            SignatureEmail: newNode.signatureEmail,
            Name: newNode.encryptedName,
            NameSignatureEmail: newNode.nameSignatureEmail,
            Hash: newNode.hash,
            OriginalHash: oldNode.hash,
            ContentHash: newNode.contentHash || null,
        }, signal);
    }

    // Improvement requested: API without requiring parent node (to delete any nodes).
    // Improvement requested: split into multiple calls for many nodes.
    async function trashNodes(parentNodeUid: string, nodeUids: string[], signal?: AbortSignal): Promise<void> {
        const { volumeId, nodeId: parentNodeId } = splitNodeUid(parentNodeUid);

        const nodeIds = nodeUids.map(splitNodeUid);

        const response = await apiService.post<
            PostTrashNodesRequest,
            PostTrashNodesResponse
        >(`/drive/v2/volumes/${volumeId}/folders/${parentNodeId}/trash_multiple`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        // TODO: remove `as` when backend fixes OpenAPI schema.
        handleResponseErrors(volumeId, response.Responses as LinkResponse[]);
    }

    // Improvement requested: split into multiple calls for many nodes.
    async function restoreNodes(nodeUids: string[], signal?: AbortSignal): Promise<void> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId("restoreNodes", nodeIds);

        const response = await apiService.put<
            PutRestoreNodesRequest,
            PutRestoreNodesResponse
        >(`/drive/v2/volumes/${volumeId}/trash/restore_multiple`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        // TODO: remove `as` when backend fixes OpenAPI schema.
        handleResponseErrors(volumeId, response.Responses as LinkResponse[]);
    }

    // Improvement requested: split into multiple calls for many nodes.
    async function deleteNodes(nodeUids: string[], signal?: AbortSignal): Promise<void> {
        const nodeIds = nodeUids.map(splitNodeUid);
        const volumeId = assertAndGetSingleVolumeId("restoreNodes", nodeIds);

        const response = await apiService.post<
            PostDeleteNodesRequest,
            PostDeleteNodesResponse
        >(`/drive/v2/volumes/${volumeId}/trash/delete_multiple`, {
            LinkIDs: nodeIds.map(({ nodeId }) => nodeId),
        }, signal);

        // TODO: remove `as` when backend fixes OpenAPI schema.
        handleResponseErrors(volumeId, response.Responses as LinkResponse[]);
    }

    async function createFolder(
        parentUid: string,
        newNode: {
            armoredKey: string,
            armoredHashKey: string,
            armoredNodePassphrase: string,
            armoredNodePassphraseSignature: string,
            signatureEmail: string,
            encryptedName: string,
            hash: string,
            encryptedExtendedAttributes: string,
        },
        signal?: AbortSignal,
    ): Promise<string> {
        const { volumeId, nodeId: parentId } = splitNodeUid(parentUid);

        const response = await apiService.post<
            PostCreateFolderRequest,
            PostCreateFolderResponse
        >(`/drive/v2/volumes/${volumeId}/folders`, {
            ParentLinkID: parentId,
            NodeKey: newNode.armoredKey,
            NodeHashKey: newNode.armoredHashKey,
            NodePassphrase: newNode.armoredNodePassphrase,
            NodePassphraseSignature: newNode.armoredNodePassphraseSignature,
            SignatureEmail: newNode.signatureEmail,
            Name: newNode.encryptedName,
            Hash: newNode.hash,
            XAttr: newNode.encryptedExtendedAttributes,
        }, signal);

        return response.Folder.ID;
    }

    return {
        getNode,
        getNodes,
        iterateChildrenNodeUids,
        iterateTrashedNodeUids,
        renameNode,
        moveNode,
        trashNodes,
        restoreNodes,
        deleteNodes,
        createFolder,
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

function sharingSummaryToDirectMemberRole(sharingSummary: PostLoadLinksMetadataResponse['Links'][0]['SharingSummary'], logger?: Logger): MemberRole {
    switch (sharingSummary?.ShareAccess.Permissions) {
        case 4:
            return MemberRole.Viewer;
        case 6:
            return MemberRole.Editor;
        case 22:
            return MemberRole.Admin;
        default:
            // User have access to the data, thus at minimum it can view.
            logger?.warn(`Unknown sharing permissions: ${sharingSummary?.ShareAccess.Permissions}`);
            return MemberRole.Viewer;
    }
}

type LinkResponse = {
    LinkID: string,
    Response: {
        Error?: string
    }
};

export type NodeErrors = { [ nodeUid: string ]: string };

export class ResultErrors extends Error {
    nodeErrors: NodeErrors;

    constructor(nodeErrors: NodeErrors) {
        super("Some nodes failed to process");
        this.nodeErrors = nodeErrors;
    }

    get failingNodeUids(): string[] {
        return Object.keys(this.nodeErrors);
    }
}

function handleResponseErrors(volumeId: string, responses?: LinkResponse[]) {
    if (!responses) {
        return;
    }

    const errors: NodeErrors = {};

    responses.map((response) => {
        if (response.Response.Error) {
            errors[makeNodeUid(volumeId, response.LinkID)] = response.Response.Error as string;
        }
    });

    if (Object.keys(errors).length > 0) {
        throw new ResultErrors(errors);
    }
}
