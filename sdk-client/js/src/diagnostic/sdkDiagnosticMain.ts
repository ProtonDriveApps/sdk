import { NodeEntity, NodeType } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import {
    DiagnosticOptions,
    DiagnosticProgressCallback,
    DiagnosticResult,
    ExpectedTreeNode,
    TreeNode,
} from './interface';
import { getTreeNodeChildByNodeName } from './nodeUtils';
import { SDKDiagnosticBase } from './sdkDiagnosticBase';
import { zipGenerators } from './zipGenerators';

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
        let myFilesRootFolder: NodeEntity;

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

    async *verifyNodeTree(node: NodeEntity, expectedStructure?: ExpectedTreeNode): AsyncGenerator<DiagnosticResult> {
        this.startProgress();
        this.nodesQueue.push({ node, expected: expectedStructure });
        this.loadedNodes++;
        yield* zipGenerators(this.loadNodeTree(node, expectedStructure), this.verifyNodesQueue());
        this.finishProgress();
    }

    private async *loadNodeTree(
        parentNode: NodeEntity,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        const isFolder = parentNode.type === NodeType.Folder;
        if (isFolder) {
            yield* this.loadNodeTreeRecursively(parentNode, expectedStructure);
        }
        this.allNodesLoaded = true;
    }

    private async *loadNodeTreeRecursively(
        parentNode: NodeEntity,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        const children: NodeEntity[] = [];

        try {
            for await (const child of this.protonDriveClient.iterateFolderChildren(parentNode)) {
                children.push(child);
                this.nodesQueue.push({
                    node: child,
                    expected: getTreeNodeChildByNodeName(expectedStructure, child.name),
                });
                this.loadedNodes++;
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateFolderChildren(${parentNode.uid})`,
                error,
            };
        }

        if (expectedStructure) {
            yield * this.verifyExpectedNodeChildren(parentNode.uid, children, expectedStructure);
        }

        for (const child of children) {
            if (child.type === NodeType.Folder) {
                yield* this.loadNodeTreeRecursively(child, getTreeNodeChildByNodeName(expectedStructure, child.name));
            }
        }
    }

    async getStructure(node: NodeEntity): Promise<TreeNode> {
        const treeNode: TreeNode = {
            uid: node.uid,
            type: node.type,
            name: node.name.ok ? node.name.value : 'N/A',
        };

        if (node.errors?.length) {
            treeNode.error = node.errors;
        }

        if (node.type === NodeType.Folder) {
            const children = [];

            for await (const child of this.protonDriveClient.iterateFolderChildren(node)) {
                children.push(child);
            }

            treeNode.children = [];
            for (const child of children) {
                const childStructure = await this.getStructure(child);
                treeNode.children.push(childStructure);
            }
        } else if (node.type === NodeType.File) {
            const activeRevision = node.activeRevision?.ok ? node.activeRevision.value : undefined;
            treeNode.claimedSha1 = activeRevision?.claimedDigests?.sha1;
            treeNode.claimedSizeInBytes = activeRevision?.claimedSize;
        }

        return treeNode;
    }
}
