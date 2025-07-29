import { MaybeNode, NodeEntity, DegradedNode } from '../../../sdk/src';

export function getNode(maybeNode: MaybeNode): NodeEntity | DegradedNode {
    return maybeNode.ok ? maybeNode.value : maybeNode.error;
}

export function getName(maybeNode: MaybeNode): string {
    if (maybeNode.ok) {
        return maybeNode.value.name;
    }
    if (maybeNode.error.name.ok) {
        return maybeNode.error.name.value;
    }
    return maybeNode.error.name.error.name || maybeNode.error.uid;
}

export function getClaimedSize(maybeNode: MaybeNode): number | undefined {
    if (maybeNode.ok) {
        return maybeNode.value.activeRevision?.claimedSize;
    }
    if (maybeNode.error.activeRevision?.ok) {
        return maybeNode.error.activeRevision.value.claimedSize;
    }
}
