import { Author, FileDownloader, MaybeNode, NodeType, Revision, ThumbnailType } from '../interface';
import { ProtonDriveClient } from '../protonDriveClient';
import { DiagnosticOptions, DiagnosticResult, NodeDetails, ExcpectedTreeNode } from './interface';
import { IntegrityVerificationStream } from './integrityVerificationStream';

/**
 * Diagnostic tool that uses SDK to traverse the node tree and verify
 * the integrity of the node tree.
 *
 * It produces only events that can be read by direct SDK invocation.
 * To get the full diagnostic, use {@link FullSDKDiagnostic}.
 */
export class SDKDiagnostic {
    constructor(private protonDriveClient: ProtonDriveClient) {
        this.protonDriveClient = protonDriveClient;
    }

    async *verifyMyFiles(options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
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

        yield* this.verifyNodeTree(myFilesRootFolder, options);
    }

    async *verifyNodeTree(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        const isFolder = getNodeType(node) === NodeType.Folder;

        yield* this.verifyNode(node, options);

        if (isFolder) {
            yield* this.verifyNodeChildren(node, options);
        }
    }

    private async *verifyNode(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        if (!node.ok) {
            yield {
                type: 'degraded_node',
                ...getNodeDetails(node),
            };
        }

        yield* this.verifyAuthor(node.ok ? node.value.keyAuthor : node.error.keyAuthor, 'key', node);
        yield* this.verifyAuthor(node.ok ? node.value.nameAuthor : node.error.nameAuthor, 'name', node);

        const activeRevision = getActiveRevision(node);
        if (activeRevision) {
            yield* this.verifyAuthor(activeRevision.contentAuthor, 'content', node);
        }

        yield* this.verifyFileExtendedAttributes(node, options);

        if (options?.verifyContent) {
            yield* this.verifyContent(node);
        }
        if (options?.verifyThumbnails) {
            yield* this.verifyThumbnails(node);
        }
    }

    private async *verifyAuthor(author: Author, authorType: string, node: MaybeNode): AsyncGenerator<DiagnosticResult> {
        if (!author.ok) {
            yield {
                type: 'unverified_author',
                authorType,
                claimedAuthor: author.error.claimedAuthor,
                error: author.error.error,
                ...getNodeDetails(node),
            };
        }
    }

    private async *verifyFileExtendedAttributes(
        node: MaybeNode,
        options?: DiagnosticOptions,
    ): AsyncGenerator<DiagnosticResult> {
        const activeRevision = getActiveRevision(node);

        const expectedAttributes = getNodeType(node) === NodeType.File;

        const claimedSha1 = activeRevision?.claimedDigests?.sha1;
        const claimedSizeInBytes = activeRevision?.claimedSize;

        if (claimedSha1 && !/^[0-9a-f]{40}$/i.test(claimedSha1)) {
            yield {
                type: 'extended_attributes_error',
                field: 'sha1',
                value: claimedSha1,
                ...getNodeDetails(node),
            };
        }

        if (expectedAttributes && !claimedSha1) {
            yield {
                type: 'extended_attributes_missing_field',
                missingField: 'sha1',
                ...getNodeDetails(node),
            };
        }

        if (options?.expectedStructure) {
            const expectedSha1 = options.expectedStructure.expectedSha1;
            const expectedSizeInBytes = options.expectedStructure.expectedSizeInBytes;

            const wrongSha1 = expectedSha1 !== undefined && claimedSha1 !== expectedSha1;
            const wrongSizeInBytes = expectedSizeInBytes !== undefined && claimedSizeInBytes !== expectedSizeInBytes;

            if (wrongSha1 || wrongSizeInBytes) {
                yield {
                    type: 'expected_structure_integrity_error',
                    claimedSha1,
                    claimedSizeInBytes,
                    expectedNode: getExpectedTreeNodeDetails(options.expectedStructure),
                    ...getNodeDetails(node),
                };
            }
        }
    }

    private async *verifyContent(node: MaybeNode): AsyncGenerator<DiagnosticResult> {
        if (getNodeType(node) !== NodeType.File) {
            return;
        }
        const activeRevision = getActiveRevision(node);
        if (!activeRevision) {
            yield {
                type: 'content_file_missing_revision',
                ...getNodeDetails(node),
            };
            return;
        }

        let downloader: FileDownloader;
        try {
            downloader = await this.protonDriveClient.getFileRevisionDownloader(activeRevision.uid);
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `getFileRevisionDownloader(${activeRevision.uid})`,
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

    private async *verifyThumbnails(node: MaybeNode): AsyncGenerator<DiagnosticResult> {
        if (getNodeType(node) !== NodeType.File) {
            return;
        }

        const nodeUid = node.ok ? node.value.uid : node.error.uid;

        try {
            const result = await Array.fromAsync(
                this.protonDriveClient.iterateThumbnails([nodeUid], ThumbnailType.Type1),
            );

            if (result.length === 0) {
                yield {
                    type: 'sdk_error',
                    call: `iterateThumbnails(${nodeUid})`,
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
                call: `iterateThumbnails(${nodeUid})`,
                error,
            };
        }
    }

    private async *verifyNodeChildren(
        parentNode: MaybeNode,
        options?: DiagnosticOptions,
    ): AsyncGenerator<DiagnosticResult> {
        const parentNodeUid = parentNode.ok ? parentNode.value.uid : parentNode.error.uid;
        const children: MaybeNode[] = [];

        try {
            for await (const child of this.protonDriveClient.iterateFolderChildren(parentNode)) {
                if (options?.expectedStructure) {
                    children.push(child);
                }

                yield *
                    this.verifyNodeTree(child, {
                        ...options,
                        expectedStructure: options?.expectedStructure
                            ? getTreeNodeChildByNodeName(options.expectedStructure, getNodeName(child))
                            : undefined,
                    });
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateFolderChildren(${parentNodeUid})`,
                error,
            };
        }

        if (options?.expectedStructure) {
            yield* this.verifyExpectedNodeChildren(parentNodeUid, children, options);
        }
    }

    private async *verifyExpectedNodeChildren(
        parentNodeUid: string,
        children: MaybeNode[],
        options: DiagnosticOptions,
    ): AsyncGenerator<DiagnosticResult> {
        if (!options.expectedStructure) {
            return;
        }

        const expectedNodes = options.expectedStructure.children ?? [];
        const actualNodeNames = children.map((child) => getNodeName(child));

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
            const childName = getNodeName(child);
            const isExpected = expectedNodes.some((expectedNode) => expectedNode.name === childName);

            if (!isExpected) {
                yield {
                    type: 'expected_structure_unexpected_node',
                    ...getNodeDetails(child),
                };
            }
        }
    }
}

function getNodeDetails(node: MaybeNode): NodeDetails {
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
            nodeCreationTime: node.ok ? node.value.creationTime : node.error.creationTime,
            keyAuthor: node.ok ? node.value.keyAuthor : node.error.keyAuthor,
            nameAuthor: node.ok ? node.value.nameAuthor : node.error.nameAuthor,
            errors,
        },
        sensitiveNodeDetails: node,
    };
}

function getNodeUids(node: MaybeNode): { nodeUid: string; revisionUid?: string } {
    const activeRevision = getActiveRevision(node);
    return {
        nodeUid: node.ok ? node.value.uid : node.error.uid,
        revisionUid: activeRevision?.uid,
    };
}

function getNodeType(node: MaybeNode): NodeType {
    return node.ok ? node.value.type : node.error.type;
}

function getActiveRevision(node: MaybeNode): Revision | undefined {
    if (node.ok) {
        return node.value.activeRevision;
    }
    if (node.error.activeRevision?.ok) {
        return node.error.activeRevision.value;
    }
    return undefined;
}

function getNodeName(node: MaybeNode): string {
    if (node.ok) {
        return node.value.name;
    }
    if (node.error.name.ok) {
        return node.error.name.value;
    }
    return 'N/A';
}

function getExpectedTreeNodeDetails(expectedNode: ExcpectedTreeNode): ExcpectedTreeNode {
    return {
        ...expectedNode,
        children: undefined,
    };
}

function getTreeNodeChildByNodeName(
    expectedSubtree: ExcpectedTreeNode,
    nodeName: string,
): ExcpectedTreeNode | undefined {
    return expectedSubtree.children?.find((expectedNode) => expectedNode.name === nodeName);
}
