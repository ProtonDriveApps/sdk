import { NodeOrUid, NodeEntity } from './interface/index.js';

export function getUid(nodeUid: NodeOrUid): string {
    if (typeof nodeUid === "string") {
        return nodeUid;
    }
    return nodeUid.uid;
}

export function getUids(nodeUids: NodeOrUid[]): string[] {
    return nodeUids.map(getUid);
}

// TODO: type
export async function *convertInternalNodeIterator(nodeIterator: AsyncGenerator<any>): AsyncGenerator<NodeEntity> {
    for await (const node of nodeIterator) {
        yield convertInternalNode(node);
    }
}

// TODO: type
export async function convertInternalNodePromise(nodePromise: Promise<any>): Promise<NodeEntity> {
    const node = await nodePromise;
    return convertInternalNode(node);
}

// TODO: type
export function convertInternalNode(node: any): NodeEntity {
    // TODO: implement
    return {} as NodeEntity
}
