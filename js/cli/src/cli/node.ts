import { MaybeNode, NodeEntity, DegradedNode } from '@protontech/drive-sdk';

export function getNode(maybeNode: MaybeNode): NodeEntity | DegradedNode {
    return maybeNode.ok ? maybeNode.value : maybeNode.error;
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
    if (name.length == 0 || name.includes('/')) {
        return false;
    }
    return true;
}
