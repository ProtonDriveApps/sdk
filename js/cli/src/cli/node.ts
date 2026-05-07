import { DegradedNode, MaybeNode, NodeEntity } from '@protontech/drive-sdk';

export function getNodeUid(maybeNode: MaybeNode): string {
    return maybeNode.ok ? maybeNode.value.uid : maybeNode.error.uid;
}

export function getNode(maybeNode: MaybeNode): NodeEntity | DegradedNode {
    return maybeNode.ok ? maybeNode.value : maybeNode.error;
}

export function findName(maybeNodes: MaybeNode[], uid: string): string {
    for (const maybeNode of maybeNodes) {
        if (getNodeUid(maybeNode) === uid) {
            return getName(maybeNode);
        }
    }
    return uid;
}

export function getName(maybeNode: MaybeNode): string {
    let name;
    let uid;
    if (maybeNode.ok) {
        name = maybeNode.value.name;
        uid = maybeNode.value.uid;
    } else {
        name = maybeNode.error.name.ok ? maybeNode.error.name.value : maybeNode.error.name.error.name;
        uid = maybeNode.error.uid;
    }
    return validateName(name) ? name : uid;
}

export function getClaimedSize(maybeNode: MaybeNode): number | undefined {
    if (maybeNode.ok) {
        return maybeNode.value.activeRevision?.claimedSize;
    }
    if (maybeNode.error.activeRevision?.ok) {
        return maybeNode.error.activeRevision.value.claimedSize;
    }
}

function validateName(name: string): boolean {
    return name.length > 0;
}
