import { NodeEntity as PublicNode } from './interface';
import { DecryptedNode as InternalNode } from './internal/nodes';

type InternalPartialNode = Pick<
    InternalNode,
    'uid' |
    'parentUid' |
    'name' |
    'keyAuthor' |
    'nameAuthor' |
    'directMemberRole' |
    'type' |
    'mimeType' |
    'isShared' |
    'createdDate' |
    'trashedDate' |
    'activeRevision' |
    'folder'
>;

export function getUid(nodeUid: string | { uid: string }): string {
    if (typeof nodeUid === "string") {
        return nodeUid;
    }
    return nodeUid.uid;
}

export function getUids(nodeUids: (string | { uid: string })[]): string[] {
    return nodeUids.map(getUid);
}

export async function *convertInternalNodeIterator(nodeIterator: AsyncGenerator<InternalPartialNode>): AsyncGenerator<PublicNode> {
    for await (const node of nodeIterator) {
        yield convertInternalNode(node);
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
        directMemberRole: node.directMemberRole,
        type: node.type,
        mimeType: node.mimeType,
        isShared: node.isShared,
        createdDate: node.createdDate,
        trashedDate: node.trashedDate,
        activeRevision: node.activeRevision,
        folder: node.folder,
    };
}
