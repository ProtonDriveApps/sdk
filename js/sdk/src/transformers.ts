import {
    MaybeNode as PublicMaybeNode,
    MaybeMissingNode as PublicMaybeMissingNode,
    NodeEntity as PublicNodeEntity,
    DegradedNode as PublicDegradedNode,
    Revision as PublicRevision,
    Result,
    resultOk,
    resultError,
    MissingNode,
} from './interface';
import { DecryptedNode as InternalNode, DecryptedRevision as InternalRevision } from './internal/nodes';

type InternalPartialNode = Pick<
    InternalNode,
    | 'uid'
    | 'parentUid'
    | 'name'
    | 'keyAuthor'
    | 'nameAuthor'
    | 'directMemberRole'
    | 'type'
    | 'mediaType'
    | 'isShared'
    | 'creationTime'
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
): AsyncGenerator<PublicMaybeNode> {
    for await (const node of nodeIterator) {
        yield convertInternalNode(node);
    }
}

export async function* convertInternalMissingNodeIterator(
    nodeIterator: AsyncGenerator<InternalPartialNode | MissingNode>,
): AsyncGenerator<PublicMaybeMissingNode> {
    for await (const node of nodeIterator) {
        if ('missingUid' in node) {
            yield resultError(node);
        } else {
            yield convertInternalNode(node);
        }
    }
}

export async function convertInternalNodePromise(nodePromise: Promise<InternalPartialNode>): Promise<PublicMaybeNode> {
    const node = await nodePromise;
    return convertInternalNode(node);
}

export function convertInternalNode(node: InternalPartialNode): PublicMaybeNode {
    const baseNodeMetadata = {
        uid: node.uid,
        parentUid: node.parentUid,
        keyAuthor: node.keyAuthor,
        nameAuthor: node.nameAuthor,
        directMemberRole: node.directMemberRole,
        type: node.type,
        mediaType: node.mediaType,
        isShared: node.isShared,
        creationTime: node.creationTime,
        trashTime: node.trashTime,
        totalStorageSize: node.totalStorageSize,
        folder: node.folder,
        deprecatedShareId: node.shareId,
        treeEventScopeId: node.treeEventScopeId,
    };

    const name = node.name;
    const activeRevision = node.activeRevision;

    if (node.errors?.length || !name.ok || (activeRevision && !activeRevision.ok)) {
        return resultError({
            ...baseNodeMetadata,
            name,
            activeRevision: activeRevision?.ok
                ? resultOk(convertInternalRevision(activeRevision.value))
                : activeRevision,
            errors: node.errors,
        } as PublicDegradedNode);
    }

    return resultOk({
        ...baseNodeMetadata,
        name: name.value,
        activeRevision: activeRevision?.ok ? convertInternalRevision(activeRevision.value) : undefined,
    } as PublicNodeEntity);
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
