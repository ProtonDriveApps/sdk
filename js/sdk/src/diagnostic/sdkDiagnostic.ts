import { Author, FileDownloader, MaybeNode, NodeType, Revision, ThumbnailType } from "../interface";
import { ProtonDriveClient } from "../protonDriveClient";
import { Diagnostic, DiagnosticOptions, DiagnosticResult } from "./interface";
import { IntegrityVerificationStream } from "./integrityVerificationStream";

/**
 * Diagnostic tool that uses SDK to traverse the node tree and verify
 * the integrity of the node tree.
 *
 * It produces only events that can be read by direct SDK invocation.
 * To get the full diagnostic, use {@link FullSDKDiagnostic}.
 */
export class SDKDiagnostic implements Diagnostic {
    constructor(private protonDriveClient: ProtonDriveClient) {
        this.protonDriveClient = protonDriveClient;
    }

    async* verifyMyFiles(options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
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

    async* verifyNodeTree(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        const isFolder = getNodeType(node) === NodeType.Folder;

        yield* this.verifyNode(node, options);

        if (isFolder) {
            yield* this.verifyNodeChildren(node, options);
        }
    }

    private async* verifyNode(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        const nodeUid = node.ok ? node.value.uid : node.error.uid;

        if (!node.ok) {
            yield {
                type: 'degraded_node',
                nodeUid,
                node: node.error,
            };
        }

        const activeRevision = getActiveRevision(node);
        const nodeInfo = {
            ...getNodeUids(node),
            node,
        }

        yield* this.verifyAuthor(node.ok ? node.value.keyAuthor : node.error.keyAuthor, { ...nodeInfo, authorType: 'key' });
        yield* this.verifyAuthor(node.ok ? node.value.nameAuthor : node.error.nameAuthor, { ...nodeInfo, authorType: 'name' });
        if (activeRevision) {
            yield* this.verifyAuthor(activeRevision.contentAuthor, { ...nodeInfo, authorType: 'content' });
        }

        yield* this.verifyFileExtendedAttributes(node);

        if (options?.verifyContent) {
            yield* this.verifyContent(node);
        }
        if (options?.verifyThumbnails) {
            yield* this.verifyThumbnails(node);
        }
    }

    private async* verifyAuthor(author: Author, info: { nodeUid: string, authorType: string, revisionUid?: string, node: MaybeNode }): AsyncGenerator<DiagnosticResult> {
        if (!author.ok) {
            yield {
                type: 'unverified_author',
                claimedAuthor: author.error.claimedAuthor,
                error: author.error.error,
                ...info,
            };
        }
    }

    private async* verifyFileExtendedAttributes(node: MaybeNode): AsyncGenerator<DiagnosticResult> {
        const activeRevision = getActiveRevision(node);

        const expectedAttributes = getNodeType(node) === NodeType.File;

        const claimedSha1 = activeRevision?.claimedDigests?.sha1;
        if (claimedSha1 && !/^[0-9a-f]{40}$/i.test(claimedSha1)) {
            yield {
                type: 'extended_attributes_error',
                ...getNodeUids(node),
                field: 'sha1',
                value: claimedSha1,
            }
        }

        if (expectedAttributes && !claimedSha1) {
            yield {
                type: 'extended_attributes_missing_field',
                ...getNodeUids(node),
                missingField: 'sha1',
            }
        }
    }

    private async* verifyContent(node: MaybeNode): AsyncGenerator<DiagnosticResult> {
        if (getNodeType(node) !== NodeType.File) {
            return;
        }
        const activeRevision = getActiveRevision(node);
        if (!activeRevision) {
            yield {
                type: 'content_file_missing_revision',
                nodeUid: node.ok ? node.value.uid : node.error.uid,
            }
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
        const controller = downloader.writeToStream(integrityVerificationStream);

        try {
            await controller.completion();

            const computedSha1 = integrityVerificationStream.computedSha1;
            const computedSizeInBytes = integrityVerificationStream.computedSizeInBytes;
            if (claimedSha1 !== computedSha1 || claimedSizeInBytes !== computedSizeInBytes) {
                yield {
                    type: 'content_integrity_error',
                    ...getNodeUids(node),
                    claimedSha1,
                    computedSha1,
                    claimedSizeInBytes,
                    computedSizeInBytes,
                };
            }
        } catch (error: unknown) {
            yield {
                type: 'content_download_error',
                ...getNodeUids(node),
                error,
            };
        }
    }

    private async* verifyThumbnails(node: MaybeNode): AsyncGenerator<DiagnosticResult> {
        if (getNodeType(node) !== NodeType.File) {
            return;
        }

        const nodeUid = node.ok ? node.value.uid : node.error.uid;

        try {
            const result = await Array.fromAsync(this.protonDriveClient.iterateThumbnails([nodeUid], ThumbnailType.Type1));

            if (result.length === 0) {
                yield {
                    type: 'sdk_error',
                    call: `iterateThumbnails(${nodeUid})`,
                    error: new Error('No thumbnails found'),
                }
            }
            // TODO: We should have better way to check if the thumbnail is not expected.
            if (!result[0].ok && result[0].error !== 'Node has no thumbnail') {
                yield {
                    type: 'thumbnails_error',
                    nodeUid,
                    error: result[0].error,
                }
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateThumbnails(${nodeUid})`,
                error,
            }
        }
    }

    private async* verifyNodeChildren(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult> {
        const nodeUid = node.ok ? node.value.uid : node.error.uid;
        try {
            for await (const child of this.protonDriveClient.iterateFolderChildren(node)) {
                yield* this.verifyNodeTree(child, options);
            }
        } catch (error: unknown) {
            yield {
                type: 'sdk_error',
                call: `iterateFolderChildren(${nodeUid})`,
                error,
            };
        }
    }
}

function getNodeUids(node: MaybeNode): { nodeUid: string, revisionUid?: string } {
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
