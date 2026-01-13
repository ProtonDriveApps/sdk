import { MaybeNode, NodeType } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import {
    DiagnosticOptions,
    DiagnosticProgressCallback,
    DiagnosticResult,
    ExpectedTreeNode,
    TreeNode,
} from './interface';
import { zipGenerators } from './zipGenerators';
import { getNodeType, getNodeName, getTreeNodeChildByNodeName, getActiveRevision } from './nodeUtils';
import { SDKDiagnosticBase } from './sdkDiagnosticBase';

/**
 * Diagnostic tool that uses the main Drive SDK to traverse and verify
 * the integrity of the node tree.
 */
export class SDKDiagnosticMain extends SDKDiagnosticBase {
    constructor(
        private protonDriveClient: ProtonDriveClient,
        options?: Pick<DiagnosticOptions, 'verifyContent' | 'verifyThumbnails'>,
        onProgress?: DiagnosticProgressCallback,
    ) {
        super(protonDriveClient, options, onProgress);
        this.protonDriveClient = protonDriveClient;
    }

    async *verifyMyFiles(expectedStructure?: ExpectedTreeNode): AsyncGenerator<DiagnosticResult> {
        let myFilesRootFolder: MaybeNode;

        try {
            myFilesRootFolder = await this.protonDriveClient.getMyFilesRootFolder();
        } catch (error: unknown) {
            yield {
                type: 'fatal_error',
                message: `Error getting my files root folder`,
                error,
            };
            return;
        }

        yield* this.verifyNodeTree(myFilesRootFolder, expectedStructure);
    }

    async *verifyNodeTree(node: MaybeNode, expectedStructure?: ExpectedTreeNode): AsyncGenerator<DiagnosticResult> {
        this.startProgress();
        this.nodesQueue.push({ node, expected: expectedStructure });
        this.loadedNodes++;
        yield* zipGenerators(this.loadNodeTree(node, expectedStructure), this.verifyNodesQueue());
        this.finishProgress();
    }

    private async *loadNodeTree(
        parentNode: MaybeNode,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        const isFolder = getNodeType(parentNode) === NodeType.Folder;
        if (isFolder) {
            yield* this.loadNodeTreeRecursively(parentNode, expectedStructure);
        }
        this.allNodesLoaded = true;
    }

    private async *loadNodeTreeRecursively(
        parentNode: MaybeNode,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        const parentNodeUid = parentNode.ok ? parentNode.value.uid : parentNode.error.uid;
        const children: MaybeNode[] = [];

        try {
            for await (const child of this.protonDriveClient.iterateFolderChildren(parentNode)) {
                children.push(child);
                this.nodesQueue.push({
                    node: child,
                    expected: getTreeNodeChildByNodeName(expectedStructure, getNodeName(child)),
                });
                this.loadedNodes++;
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateFolderChildren(${parentNodeUid})`,
                error,
            };
        }

        if (expectedStructure) {
            yield* this.verifyExpectedNodeChildren(parentNodeUid, children, expectedStructure);
        }

        for (const child of children) {
            if (getNodeType(child) === NodeType.Folder) {
                yield* this.loadNodeTreeRecursively(
                    child,
                    getTreeNodeChildByNodeName(expectedStructure, getNodeName(child)),
                );
            }
        }
    }

    async getStructure(node: MaybeNode): Promise<TreeNode> {
        const nodeType = getNodeType(node);
        const treeNode: TreeNode = {
            uid: node.ok ? node.value.uid : node.error.uid,
            type: nodeType,
            name: getNodeName(node),
        };

        if (!node.ok) {
            treeNode.error = node.error || 'degraded node';
        }

        if (nodeType === NodeType.Folder) {
            const children = [];

            for await (const child of this.protonDriveClient.iterateFolderChildren(node)) {
                children.push(child);
            }

            treeNode.children = [];
            for (const child of children) {
                const childStructure = await this.getStructure(child);
                treeNode.children.push(childStructure);
            }
        } else if (nodeType === NodeType.File) {
            const activeRevision = getActiveRevision(node);
            treeNode.claimedSha1 = activeRevision?.claimedDigests?.sha1;
            treeNode.claimedSizeInBytes = activeRevision?.claimedSize;
        }

        return treeNode;
    }
}
