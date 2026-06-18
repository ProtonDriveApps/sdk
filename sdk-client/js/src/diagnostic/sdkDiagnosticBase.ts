import { Author, FileDownloader, NodeEntity, NodeOrUid, NodeType, ThumbnailResult, ThumbnailType } from '../interface';
import { isProtonDocument, isProtonSheet } from '../internal/nodes/mediaTypes';
import { IntegrityVerificationStream } from './integrityVerificationStream';
import { DiagnosticOptions, DiagnosticProgressCallback, DiagnosticResult, ExpectedTreeNode } from './interface';
import { getExpectedTreeNodeDetails, getNodeDetails } from './nodeUtils';

const PROGRESS_REPORT_INTERVAL = 500;

interface SDKClient {
    getFileDownloader(nodeOrUid: NodeOrUid): Promise<FileDownloader>;
    iterateThumbnails(nodeUids: string[], thumbnailType: ThumbnailType): AsyncGenerator<ThumbnailResult>;
}

/**
 * Base class for all SDK diagnostic tools that verifies the integrity of
 * the individual nodes.
 */
export class SDKDiagnosticBase {
    private options: Pick<DiagnosticOptions, 'verifyContent' | 'verifyThumbnails'>;

    private onProgress?: DiagnosticProgressCallback;
    private progressReportInterval: NodeJS.Timeout | undefined;

    protected nodesQueue: { node: NodeEntity; expected?: ExpectedTreeNode }[] = [];
    protected allNodesLoaded: boolean = false;
    protected loadedNodes: number = 0;
    protected checkedNodes: number = 0;

    constructor(
        private sdkClient: SDKClient,
        options?: Pick<DiagnosticOptions, 'verifyContent' | 'verifyThumbnails'>,
        onProgress?: DiagnosticProgressCallback,
    ) {
        this.sdkClient = sdkClient;
        this.options = options || { verifyContent: false, verifyThumbnails: false };
        this.onProgress = onProgress;
    }

    protected startProgress(): void {
        this.allNodesLoaded = false;
        this.loadedNodes = 0;
        this.checkedNodes = 0;

        this.reportProgress();
        this.progressReportInterval = setInterval(() => {
            this.reportProgress();
        }, PROGRESS_REPORT_INTERVAL);
    }

    protected finishProgress(): void {
        if (this.progressReportInterval) {
            clearInterval(this.progressReportInterval);
            this.progressReportInterval = undefined;
        }

        this.reportProgress();
    }

    private reportProgress(): void {
        this.onProgress?.({
            allNodesLoaded: this.allNodesLoaded,
            loadedNodes: this.loadedNodes,
            checkedNodes: this.checkedNodes,
        });
    }

    protected async *verifyExpectedNodeChildren(
        parentNodeUid: string,
        children: NodeEntity[],
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        if (!expectedStructure) {
            return;
        }

        const expectedNodes = expectedStructure.children ?? [];
        const actualNodeNames = children.map((child) => (child.name.ok ? child.name.value : 'N/A'));

        for (const expectedNode of expectedNodes) {
            if (!actualNodeNames.includes(expectedNode.name)) {
                yield {
                    type: 'expected_structure_missing_node',
                    expectedNode: getExpectedTreeNodeDetails(expectedNode),
                    parentNodeUid,
                };
            }
        }

        for (const child of children) {
            const childName = child.name.ok ? child.name.value : 'N/A';
            const isExpected = expectedNodes.some((expectedNode) => expectedNode.name === childName);

            if (!isExpected) {
                yield {
                    type: 'expected_structure_unexpected_node',
                    ...getNodeDetails(child),
                };
            }
        }
    }

    protected async *verifyNodesQueue(): AsyncGenerator<DiagnosticResult> {
        while (this.nodesQueue.length > 0 || !this.allNodesLoaded) {
            const result = this.nodesQueue.shift();
            if (result) {
                yield* this.verifyNode(result.node, result.expected);
                this.checkedNodes++;
            } else {
                // Wait for 100ms before checking again.
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
    }

    private async *verifyNode(
        node: NodeEntity,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        if (node.errors?.length) {
            yield {
                type: 'degraded_node',
                ...getNodeDetails(node),
            };
        }

        yield* this.verifyAuthor(node.keyAuthor, 'key', node, expectedStructure);
        yield* this.verifyAuthor(node.nameAuthor, 'name', node, expectedStructure);

        const activeRevision = node.activeRevision?.ok ? node.activeRevision.value : undefined;
        if (activeRevision) {
            yield* this.verifyAuthor(activeRevision.contentAuthor, 'content', node, expectedStructure);
        }

        yield* this.verifyFileExtendedAttributes(node, expectedStructure);

        if (this.options.verifyContent === 'peakOnly') {
            yield* this.verifyContentPeak(node);
        } else if (this.options.verifyContent) {
            yield* this.verifyContent(node);
        }
        if (this.options.verifyThumbnails) {
            yield* this.verifyThumbnails(node);
        }

        if (expectedStructure?.expectedMediaType) {
            if (node.mediaType !== expectedStructure.expectedMediaType) {
                yield {
                    type: 'expected_structure_integrity_error',
                    expectedNode: getExpectedTreeNodeDetails(expectedStructure),
                    ...getNodeDetails(node),
                };
            }
        }
    }

    private async *verifyAuthor(
        author: Author,
        authorType: 'key' | 'name' | 'content',
        node: NodeEntity,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        if (!author.ok) {
            yield {
                type: 'unverified_author',
                authorType,
                claimedAuthor: author.error.claimedAuthor,
                error: author.error.error,
                ...getNodeDetails(node),
            };
        }

        if (expectedStructure?.expectedAuthors) {
            let expectedEmail: string | null | undefined =
                typeof expectedStructure.expectedAuthors === 'string'
                    ? expectedStructure.expectedAuthors
                    : expectedStructure.expectedAuthors[authorType];

            if (expectedEmail === 'anonymous') {
                expectedEmail = null;
            }

            const email = author.ok ? author.value : author.error.claimedAuthor;
            if (expectedEmail !== undefined && email !== expectedEmail) {
                yield {
                    type: 'expected_structure_integrity_error',
                    expectedNode: getExpectedTreeNodeDetails(expectedStructure),
                    ...getNodeDetails(node),
                };
            }
        }
    }

    private async *verifyFileExtendedAttributes(
        node: NodeEntity,
        expectedStructure?: ExpectedTreeNode,
    ): AsyncGenerator<DiagnosticResult> {
        const activeRevision = node.activeRevision?.ok ? node.activeRevision.value : undefined;

        const isNodeWithContent = this.isNodeWithContent(node);

        const claimedSha1 = activeRevision?.claimedDigests?.sha1;
        const claimedSizeInBytes = activeRevision?.claimedSize;

        if (isNodeWithContent && claimedSha1 && !/^[0-9a-f]{40}$/i.test(claimedSha1)) {
            yield {
                type: 'extended_attributes_error',
                field: 'sha1',
                value: claimedSha1,
                ...getNodeDetails(node),
            };
        }

        if (isNodeWithContent && !claimedSha1) {
            yield {
                type: 'extended_attributes_missing_field',
                missingField: 'sha1',
                ...getNodeDetails(node),
            };
        }

        if (expectedStructure) {
            const expectedSha1 = expectedStructure.expectedSha1;
            const expectedSizeInBytes = expectedStructure.expectedSizeInBytes;

            const wrongSha1 = expectedSha1 !== undefined && claimedSha1 !== expectedSha1;
            const wrongSizeInBytes = expectedSizeInBytes !== undefined && claimedSizeInBytes !== expectedSizeInBytes;

            if (wrongSha1 || wrongSizeInBytes) {
                yield {
                    type: 'expected_structure_integrity_error',
                    claimedSha1,
                    claimedSizeInBytes,
                    expectedNode: getExpectedTreeNodeDetails(expectedStructure),
                    ...getNodeDetails(node),
                };
            }
        }
    }

    private async *verifyContentPeak(node: NodeEntity): AsyncGenerator<DiagnosticResult> {
        if (!this.isNodeWithContent(node)) {
            return;
        }

        let downloader: FileDownloader;
        try {
            downloader = await this.sdkClient.getFileDownloader(node);
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `getFileDownloader(${node.uid})`,
                error,
            };
            return;
        }

        try {
            const stream = downloader.getSeekableStream();
            const peak = await stream.read(1024);
            if (peak.value.length === 0) {
                yield {
                    type: 'content_download_error',
                    error: new Error('No data read'),
                    ...getNodeDetails(node),
                };
            }
        } catch (error: unknown) {
            yield {
                type: 'content_download_error',
                error,
                ...getNodeDetails(node),
            };
        }
    }

    private async *verifyContent(node: NodeEntity): AsyncGenerator<DiagnosticResult> {
        if (!this.isNodeWithContent(node)) {
            return;
        }
        const activeRevision = node.activeRevision?.ok ? node.activeRevision.value : undefined;
        if (!activeRevision) {
            yield {
                type: 'content_file_missing_revision',
                ...getNodeDetails(node),
            };
            return;
        }

        let downloader: FileDownloader;
        try {
            downloader = await this.sdkClient.getFileDownloader(node);
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `getFileDownloader(${node.uid})`,
                error,
            };
            return;
        }

        const claimedSha1 = activeRevision.claimedDigests?.sha1;
        const claimedSizeInBytes = downloader.getClaimedSizeInBytes();

        const integrityVerificationStream = new IntegrityVerificationStream();
        const controller = downloader.downloadToStream(integrityVerificationStream);

        try {
            await controller.completion();
            await integrityVerificationStream.close();

            const computedSha1 = integrityVerificationStream.computedSha1;
            const computedSizeInBytes = integrityVerificationStream.computedSizeInBytes;
            if (claimedSha1 !== computedSha1 || claimedSizeInBytes !== computedSizeInBytes) {
                yield {
                    type: 'content_integrity_error',
                    claimedSha1,
                    computedSha1,
                    claimedSizeInBytes,
                    computedSizeInBytes,
                    ...getNodeDetails(node),
                };
            }
        } catch (error: unknown) {
            yield {
                type: 'content_download_error',
                error,
                ...getNodeDetails(node),
            };
        }
    }

    private async *verifyThumbnails(node: NodeEntity): AsyncGenerator<DiagnosticResult> {
        if (!this.isNodeWithContent(node)) {
            return;
        }

        try {
            const result = await Array.fromAsync(this.sdkClient.iterateThumbnails([node.uid], ThumbnailType.Type1));

            if (result.length === 0) {
                yield {
                    type: 'sdk_error',
                    call: `iterateThumbnails(${node.uid})`,
                    error: new Error('No thumbnails found'),
                };
            }
            // TODO: We should have better way to check if the thumbnail is not expected.
            if (!result[0].ok && result[0].error !== 'Node has no thumbnail') {
                yield {
                    type: 'thumbnails_error',
                    error: result[0].error,
                    ...getNodeDetails(node),
                };
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateThumbnails(${node.uid})`,
                error,
            };
        }
    }

    private isNodeWithContent(node: NodeEntity): boolean {
        const isFile = node.type === NodeType.File || node.type === NodeType.Photo;

        const mediaType = node.mediaType;
        const isDocs = isProtonDocument(mediaType) || isProtonSheet(mediaType);

        return isFile && !isDocs;
    }
}
