import { MaybeNode } from '../interface';
import { ProtonDrivePhotosClient } from '../protonDrivePhotosClient';
import { DiagnosticOptions, DiagnosticProgressCallback, DiagnosticResult, ExpectedTreeNode } from './interface';
import { zipGenerators } from './zipGenerators';
import { getNodeName, getTreeNodeChildByNodeName } from './nodeUtils';
import { SDKDiagnosticBase } from './sdkDiagnosticBase';

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

        const photos: MaybeNode[] = [];
        try {
            for await (const maybeMissingNode of this.protonDrivePhotosClient.iterateNodes(nodeUids)) {
                if (!maybeMissingNode.ok && 'missingUid' in maybeMissingNode.error) {
                    continue;
                }
                const maybeNode = maybeMissingNode as MaybeNode;

                photos.push(maybeNode);
                this.nodesQueue.push({
                    node: maybeNode,
                    expected: getTreeNodeChildByNodeName(expectedStructure, getNodeName(maybeNode)),
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
}
