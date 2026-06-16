import {
    MaybeMissingNode as PublicMaybeMissingNode,
    MaybeMissingPhotoNode as PublicMaybeMissingPhotoNode,
    MissingNode,
    NodeEntity as PublicNode,
    NodeType,
    PhotoNode as PublicPhotoNode,
    Result,
    Revision as PublicRevision,
} from './interface';
import { DecryptedNode as InternalNode, DecryptedRevision as InternalRevision } from './internal/nodes';
import { DecryptedPhotoNode as InternalPartialPhotoNode } from './internal/photos';

type InternalPartialNode = Pick<
    InternalNode,
    | 'uid'
    | 'parentUid'
    | 'name'
    | 'keyAuthor'
    | 'nameAuthor'
    | 'directRole'
    | 'membership'
    | 'ownedBy'
    | 'type'
    | 'mediaType'
    | 'isShared'
    | 'isSharedPublicly'
    | 'creationTime'
    | 'modificationTime'
    | 'trashTime'
    | 'activeRevision'
    | 'folder'
    | 'totalStorageSize'
    | 'errors'
    | 'shareId'
    | 'treeEventScopeId'
>;

type NodeUid = string | { uid: string } | Result<{ uid: string }, { uid: string }>;

export function getUid(nodeUid: NodeUid): string {
    if (typeof nodeUid === 'string') {
        return nodeUid;
    }
    // Directly passed NodeEntity or DegradedNode that has UID directly.
    if ('uid' in nodeUid) {
        return nodeUid.uid;
    }
    // MaybeNode that can be either NodeEntity or DegradedNode.
    if (nodeUid.ok) {
        return nodeUid.value.uid;
    }
    return nodeUid.error.uid;
}

export function getUids(nodeUids: NodeUid[]): string[] {
    return nodeUids.map(getUid);
}

export async function* convertInternalNodeIterator(
    nodeIterator: AsyncGenerator<InternalPartialNode>,
): AsyncGenerator<PublicNode> {
    for await (const node of nodeIterator) {
        yield convertInternalNode(node);
    }
}

export async function* convertInternalMissingNodeIterator(
    nodeIterator: AsyncGenerator<InternalPartialNode | MissingNode>,
): AsyncGenerator<PublicMaybeMissingNode> {
    for await (const node of nodeIterator) {
        if ('missingUid' in node) {
            yield node;
        } else {
            yield convertInternalNode(node);
        }
    }
}

export async function convertInternalNodePromise(nodePromise: Promise<InternalPartialNode>): Promise<PublicNode> {
    const node = await nodePromise;
    return convertInternalNode(node);
}

export function convertInternalNode(node: InternalPartialNode): PublicNode {
    return {
        uid: node.uid,
        parentUid: node.parentUid,
        name: node.name,
        keyAuthor: node.keyAuthor,
        nameAuthor: node.nameAuthor,
        directRole: node.directRole,
        membership: node.membership,
        ownedBy: node.ownedBy,
        type: node.type,
        mediaType: node.mediaType,
        isShared: node.isShared,
        isSharedPublicly: node.isSharedPublicly,
        creationTime: node.creationTime,
        modificationTime: node.modificationTime,
        trashTime: node.trashTime,
        totalStorageSize: node.totalStorageSize,
        activeRevision: node.activeRevision?.ok
            ? { ok: true, value: convertInternalRevision(node.activeRevision.value) }
            : node.activeRevision,
        folder: node.folder,
        deprecatedShareId: node.shareId,
        treeEventScopeId: node.treeEventScopeId,
        errors: node.errors,
    };
}

export async function* convertInternalPhotoNodeIterator(
    photoNodeIterator: AsyncGenerator<InternalPartialPhotoNode>,
): AsyncGenerator<PublicPhotoNode> {
    for await (const photoNode of photoNodeIterator) {
        yield convertInternalPhotoNode(photoNode);
    }
}

export async function* convertInternalMissingPhotoNodeIterator(
    photoNodeIterator: AsyncGenerator<InternalPartialPhotoNode | MissingNode>,
): AsyncGenerator<PublicMaybeMissingPhotoNode> {
    for await (const photoNode of photoNodeIterator) {
        if ('missingUid' in photoNode) {
            yield photoNode;
        } else {
            yield convertInternalPhotoNode(photoNode);
        }
    }
}

export async function convertInternalPhotoNodePromise(
    photoNodePromise: Promise<InternalPartialPhotoNode>,
): Promise<PublicPhotoNode> {
    const photoNode = await photoNodePromise;
    return convertInternalPhotoNode(photoNode);
}

export function convertInternalPhotoNode(photoNode: InternalPartialPhotoNode): PublicPhotoNode {
    const node = convertInternalNode(photoNode);
    if (photoNode.type !== NodeType.Photo && photoNode.type !== NodeType.Album && photoNode.type !== NodeType.Folder) {
        throw new TypeError(`Invalid photo node type: ${photoNode.type}`);
    }
    return {
        ...node,
        type: photoNode.type,
        photo: photoNode.photo,
        album: photoNode.album,
    };
}

export async function* convertInternalRevisionIterator(
    revisionIterator: AsyncGenerator<InternalRevision>,
): AsyncGenerator<PublicRevision> {
    for await (const revision of revisionIterator) {
        yield convertInternalRevision(revision);
    }
}

function convertInternalRevision(revision: InternalRevision): PublicRevision {
    return {
        uid: revision.uid,
        state: revision.state,
        creationTime: revision.creationTime,
        contentAuthor: revision.contentAuthor,
        storageSize: revision.storageSize,
        claimedSize: revision.claimedSize,
        claimedModificationTime: revision.claimedModificationTime,
        claimedDigests: revision.claimedDigests,
        claimedAdditionalMetadata: revision.claimedAdditionalMetadata,
    };
}
