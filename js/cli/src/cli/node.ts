import { NodeEntity } from '@protontech/drive-sdk';

export function findName(nodes: NodeEntity[], uid: string): string {
    for (const node of nodes) {
        if (node.uid === uid) {
            return getName(node);
        }
    }
    return uid;
}

export function getName(node: NodeEntity): string {
    const name = node.name.ok ? node.name.value : '';
    return name.length > 0 ? name : node.uid;
}

export function getClaimedSize(node: NodeEntity): number | undefined {
    const activeRevision = node.activeRevision?.ok ? node.activeRevision.value : undefined;
    return activeRevision?.claimedSize;
}
