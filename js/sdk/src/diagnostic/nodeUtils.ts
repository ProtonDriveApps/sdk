import { MaybeNode, NodeType, Revision } from '../interface';
import {
    NodeDetails,
    ExpectedTreeNode,
} from './interface';

export function getNodeDetails(node: MaybeNode): NodeDetails {
    const errors: {
        field: string;
        error: unknown;
    }[] = [];

    if (!node.ok) {
        const degradedNode = node.error;
        if (!degradedNode.name.ok) {
            errors.push({
                field: 'name',
                error: degradedNode.name.error,
            });
        }
        if (degradedNode.activeRevision?.ok === false) {
            errors.push({
                field: 'activeRevision',
                error: degradedNode.activeRevision.error,
            });
        }
        for (const error of degradedNode.errors ?? []) {
            if (error instanceof Error) {
                errors.push({
                    field: 'error',
                    error,
                });
            }
        }
    }

    return {
        safeNodeDetails: {
            ...getNodeUids(node),
            nodeType: getNodeType(node),
            mediaType: getMediaType(node),
            nodeCreationTime: node.ok ? node.value.creationTime : node.error.creationTime,
            keyAuthor: node.ok ? node.value.keyAuthor : node.error.keyAuthor,
            nameAuthor: node.ok ? node.value.nameAuthor : node.error.nameAuthor,
            contentAuthor: getActiveRevision(node)?.contentAuthor,
            errors,
        },
        sensitiveNodeDetails: node,
    };
}

export function getNodeUids(node: MaybeNode): { nodeUid: string; revisionUid: string | undefined } {
    const activeRevision = getActiveRevision(node);
    return {
        nodeUid: node.ok ? node.value.uid : node.error.uid,
        revisionUid: activeRevision?.uid,
    };
}

export function getNodeType(node: MaybeNode): NodeType {
    return node.ok ? node.value.type : node.error.type;
}

export function getMediaType(node: MaybeNode): string | undefined {
    return node.ok ? node.value.mediaType : node.error.mediaType;
}

export function getActiveRevision(node: MaybeNode): Revision | undefined {
    if (node.ok) {
        return node.value.activeRevision;
    }
    if (node.error.activeRevision?.ok) {
        return node.error.activeRevision.value;
    }
    return undefined;
}

export function getNodeName(node: MaybeNode): string {
    if (node.ok) {
        return node.value.name;
    }
    if (node.error.name.ok) {
        return node.error.name.value;
    }
    return 'N/A';
}

export function getExpectedTreeNodeDetails(expectedNode: ExpectedTreeNode): ExpectedTreeNode {
    return {
        ...expectedNode,
        children: undefined,
    };
}

export function getTreeNodeChildByNodeName(
    expectedSubtree: ExpectedTreeNode | undefined,
    nodeName: string,
): ExpectedTreeNode | undefined {
    return expectedSubtree?.children?.find((expectedNode) => expectedNode.name === nodeName);
}
