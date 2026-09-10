import path from 'node:path';

import { Logger, NodeEntity, NodeType, ProtonDriveClient } from '@protontech/drive-sdk';

import { getName } from '../../cli';
import { createLocalFolder, type DownloadFileData } from '../fileSystem/downloadOperations';
import {
    type QueueItem,
    type QueueItemFile,
    TransferQueue,
    type TransferQueueHandlers,
} from '../fileSystem/transferQueue';
import { TransferSummary } from '../fileSystem/transferSummary';
import { ALREADY_EXISTS_MESSAGE } from './const';
import { exportNode } from './exportNode';
import type { TakeoutContext, TakeoutFileData } from './interface';
import { NameRegistry } from './nameRegistry';
import { serializeNodeName, type TransferManifestBuilder, type TransferManifestItem } from './transferManifest';

type FolderTreeRoot = {
    node: NodeEntity;
    /** Local absolute path where the tree is rooted. */
    localPath: string;
    /** Path relative to the section root, as represented in the manifest file (with POSIX separators). */
    manifestPath: string;
};

type TreeItemData = DownloadFileData & {
    /** Path relative to the section root, as represented in the manifest file (with POSIX separators). */
    manifestPath: string;
    /** Name of the accompanying manifest file of the file item. File "image.jpg" has "image.jpg.manifest.json". */
    manifestName?: string;
};

/**
 * Mirrors a Drive folder tree into the takeout, recording every folder and
 * file it writes in the manifest of the section. Used by both the `my-files`
 * and the `devices` section, which differ only in where their trees are
 * rooted.
 */
export async function exportFolderTree(
    ctx: TakeoutContext,
    summary: TransferSummary,
    manifest: TransferManifestBuilder,
    root: FolderTreeRoot,
): Promise<void> {
    const queue = new FolderTreeQueue(ctx.logger, summary, ctx.sdk, {
        onDirectory: async (item) => {
            try {
                const createdPath = await createLocalFolder(ctx.driveNode.download, item);
                if (!createdPath) {
                    manifest.addSkippedItem(toManifestItem(item), ALREADY_EXISTS_MESSAGE);
                    return false;
                }
                manifest.addItem(toManifestItem(item));
                await queue.enqueueFolderChildren(item.remoteNode, createdPath, item.manifestPath);
                return true;
            } catch (error: unknown) {
                manifest.addError(error, { path: item.manifestPath, uid: item.remoteNode.uid });
                throw error;
            }
        },
        startFile: async (item) => {
            try {
                const result = await exportNode(ctx.driveNode, item as QueueItemFile<TakeoutFileData>);
                if (result.kind === 'skipped') {
                    manifest.addSkippedItem(toManifestItem(item), result.reason);
                    return false;
                }
                manifest.addItem(toManifestItem(item));
                if (result.kind === 'revisions') {
                    for (const error of result.errors) {
                        manifest.addError(error, { path: item.manifestPath, uid: item.remoteNode.uid });
                        summary.recordFailure(item.manifestPath, error, item.remoteNode.uid);
                    }
                }
                return result.bytes;
            } catch (error: unknown) {
                manifest.addError(error, { path: item.manifestPath, uid: item.remoteNode.uid });
                throw error;
            }
        },
    });

    await queue.enqueueFolderChildren(root.node, root.localPath, root.manifestPath);
    await queue.processQueue();
}

function toManifestItem(item: QueueItem<TreeItemData>): TransferManifestItem {
    return {
        path: item.manifestPath,
        uid: item.remoteNode.uid,
        ...serializeNodeName(item.remoteNode),
    };
}

class FolderTreeQueue extends TransferQueue<TreeItemData> {
    constructor(
        logger: Logger,
        summary: TransferSummary,
        private readonly sdk: ProtonDriveClient,
        handlers: TransferQueueHandlers<TreeItemData>,
    ) {
        super(logger, summary, handlers);
    }

    async enqueueFolderChildren(
        folderNode: NodeEntity,
        localFolderPath: string,
        manifestFolderPath: string,
    ): Promise<void> {
        const registry = await NameRegistry.createForFolder(localFolderPath);

        for await (const child of this.sdk.iterateFolderChildren(folderNode)) {
            if (child.type === NodeType.Folder) {
                const name = registry.allocate(getName(child));
                this.enqueueItem({
                    kind: 'directory',
                    remoteNode: child,
                    localPath: path.join(localFolderPath, name),
                    baseName: name,
                    manifestPath: joinManifestPath(manifestFolderPath, name),
                });
            } else if (child.type === NodeType.File) {
                const { name, manifestName } = registry.allocateFileWithManifest(getName(child));
                this.enqueueItem({
                    kind: 'file',
                    remoteNode: child,
                    localPath: path.join(localFolderPath, name),
                    baseName: name,
                    manifestName,
                    manifestPath: joinManifestPath(manifestFolderPath, name),
                });
            } else {
                throw new Error(`Unsupported node type for takeout: ${child.type}`);
            }
        }
    }
}

function joinManifestPath(folderPath: string, name: string): string {
    return folderPath ? `${folderPath}/${name}` : name;
}
