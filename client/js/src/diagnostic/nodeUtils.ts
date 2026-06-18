import { InvalidNameError, NodeEntity, Result } from '../interface';
import { ExpectedTreeNode, NodeDetails } from './interface';

export function getNodeDetails(node: NodeEntity): NodeDetails {
    const errors: {
        field: string;
        error: unknown;
    }[] = [];

    if (node.name.ok === false) {
        errors.push({
            field: 'name',
            error: node.name.error,
        });
    }

    if (node.activeRevision?.ok === false) {
        errors.push({
            field: 'activeRevision',
            error: node.activeRevision.error,
        });
    }

    if (node.errors?.length) {
        for (const error of node.errors) {
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
            nodeUid: node.uid,
            revisionUid: node.activeRevision?.ok ? node.activeRevision.value.uid : undefined,
            nodeType: node.type,
            mediaType: node.mediaType,
            nodeCreationTime: node.creationTime,
            keyAuthor: node.keyAuthor,
            nameAuthor: node.nameAuthor,
            contentAuthor: node.activeRevision?.ok ? node.activeRevision.value.contentAuthor : undefined,
            errors,
        },
        sensitiveNodeDetails: node,
    };
}

export function getExpectedTreeNodeDetails(expectedNode: ExpectedTreeNode): ExpectedTreeNode {
    return {
        ...expectedNode,
        children: undefined,
    };
}

export function getTreeNodeChildByNodeName(
    expectedSubtree: ExpectedTreeNode | undefined,
    nodeName: Result<string, Error | InvalidNameError>,
): ExpectedTreeNode | undefined {
    if (!nodeName.ok) {
        return undefined;
    }
    const nodeNameValue = nodeName.value;
    return expectedSubtree?.children?.find((expectedNode) => expectedNode.name === nodeNameValue);
}
