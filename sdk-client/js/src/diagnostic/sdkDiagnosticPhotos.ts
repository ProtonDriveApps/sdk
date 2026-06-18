import { NodeEntity } from '../interface';
import { ProtonDrivePhotosClient } from '../protonDrivePhotosClient';
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
 * Diagnostic tool that uses the Photos SDK to traverse and verify
 * the integrity of the Photos in the timeline.
 */
export class SDKDiagnosticPhotos extends SDKDiagnosticBase {
    constructor(
        private protonDrivePhotosClient: ProtonDrivePhotosClient,
        options?: Pick<DiagnosticOptions, 'verifyContent' | 'verifyThumbnails'>,
        onProgress?: DiagnosticProgressCallback,
    ) {
        super(protonDrivePhotosClient, options, onProgress);
        this.protonDrivePhotosClient = protonDrivePhotosClient;
    }

    async *verifyTimeline(expectedStructure?: ExpectedTreeNode): AsyncGenerator<DiagnosticResult> {
        this.startProgress();
        yield* zipGenerators(this.loadTimeline(expectedStructure), this.verifyNodesQueue());
        this.finishProgress();
    }

    private async *loadTimeline(expectedStructure?: ExpectedTreeNode): AsyncGenerator<DiagnosticResult> {
        let nodeUids: string[] = [];
        try {
            const results = await Array.fromAsync(this.protonDrivePhotosClient.iterateTimeline());
            nodeUids = results.map((result) => result.nodeUid);
            this.loadedNodes = nodeUids.length;
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateTimeline()`,
                error,
            };
        }

        const photos: NodeEntity[] = [];
        try {
            for await (const maybeMissingNode of this.protonDrivePhotosClient.iterateNodes(nodeUids)) {
                if ('missingUid' in maybeMissingNode) {
                    continue;
                }
                const maybeNode = maybeMissingNode as NodeEntity;

                photos.push(maybeNode);
                this.nodesQueue.push({
                    node: maybeNode,
                    expected: getTreeNodeChildByNodeName(expectedStructure, maybeNode.name),
                });
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateNodes(...)`,
                error,
            };
        }

        if (expectedStructure) {
            yield* this.verifyExpectedNodeChildren('photo-timeline', photos, expectedStructure);
        }

        this.allNodesLoaded = true;
    }

    async getStructure(): Promise<TreeNode> {
        const myPhotosRootFolder = await this.protonDrivePhotosClient.getMyPhotosRootFolder();

        const treeNode: TreeNode = {
            uid: myPhotosRootFolder.uid,
            type: myPhotosRootFolder.type,
            name: myPhotosRootFolder.name.ok ? myPhotosRootFolder.name.value : 'N/A',
        };
        const children = [];

        const results = await Array.fromAsync(this.protonDrivePhotosClient.iterateTimeline());
        const nodeUids = results.map((result) => result.nodeUid);

        for await (const maybeMissingNode of this.protonDrivePhotosClient.iterateNodes(nodeUids)) {
            if ('missingUid' in maybeMissingNode) {
                continue;
            }
            const node = maybeMissingNode;

            const activeRevision = node.activeRevision?.ok ? node.activeRevision.value : undefined;
            const childNode: TreeNode = {
                uid: node.uid,
                name: node.name.ok ? node.name.value : 'N/A',
                type: node.type,
                claimedSha1: activeRevision?.claimedDigests?.sha1,
                claimedSizeInBytes: activeRevision?.claimedSize,
            };

            if (node.errors?.length) {
                childNode.error = node.errors;
            }

            children.push(childNode);
        }

        treeNode.children = children;
        return treeNode;
    }
}
