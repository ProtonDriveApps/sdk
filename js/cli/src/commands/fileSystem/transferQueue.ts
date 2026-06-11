import type { Stats } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Logger, NodeEntity, NodeType, ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';

import { getName } from '../../cli';
import { sanitizePathSegmentForLocalFilesystem } from './downloadPathValidation';
import { resolveLocalPaths } from './localPath';
import { TransferSummary } from './transferSummary';

export const MAX_CONCURRENT_ITEMS = 5;

type QueueItemBase<RemoteDataType> = {
    localPath: string;
    baseName: string;
} & RemoteDataType;

export type QueueItemDirectory<RemoteDataType> = QueueItemBase<RemoteDataType> & {
    kind: 'directory';
};

export type QueueItemFile<RemoteDataType> = QueueItemBase<RemoteDataType> & {
    kind: 'file';
};

export type QueueItem<RemoteDataType> = QueueItemDirectory<RemoteDataType> | QueueItemFile<RemoteDataType>;

type TransferQueueHandlers<RemoteDataType> = {
    onDirectory: (item: QueueItemDirectory<RemoteDataType>) => Promise<boolean>;
    startFile: (item: QueueItemFile<RemoteDataType>) => Promise<number | false>;
};

class TransferQueue<RemoteDataType> {
    private queue: QueueItem<RemoteDataType>[] = [];
    private ongoingItems = new Set<Promise<void>>();

    constructor(
        private readonly logger: Logger,
        private readonly summary: TransferSummary,
        private readonly handlers: TransferQueueHandlers<RemoteDataType>,
    ) {}

    async processQueue(): Promise<void> {
        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            this.updateQueuedCount();

            if (item.kind === 'directory') {
                try {
                    const completed = await this.handlers.onDirectory(item);
                    if (completed) {
                        this.recordSuccess(0);
                    } else {
                        this.recordSkip();
                    }
                } catch (error: unknown) {
                    this.recordFailure(item, error);
                }
                continue;
            }

            if (this.ongoingItems.size >= MAX_CONCURRENT_ITEMS) {
                this.logger.debug(`Waiting for ongoing items to finish`);
                await Promise.race(this.ongoingItems);
            }
            const promise = this.handlers
                .startFile(item)
                .then((result) => {
                    if (result === false) {
                        this.recordSkip();
                    } else {
                        this.recordSuccess(result);
                    }
                })
                .catch((error: unknown) => {
                    this.recordFailure(item, error);
                });
            this.ongoingItems.add(promise);
            this.updateQueuedCount();
            void promise.finally(() => {
                this.ongoingItems.delete(promise);
                this.updateQueuedCount();
            });
        }
        await Promise.all(this.ongoingItems);
    }

    protected enqueueItem(item: QueueItem<RemoteDataType>): void {
        this.queue.push(item);
        this.updateQueuedCount();
    }

    private updateQueuedCount(): void {
        const queued = this.queue.length + this.ongoingItems.size;
        this.summary.setQueuedCount(queued);
    }

    private recordSuccess(bytes: number): void {
        this.summary.recordSuccess(bytes);
    }

    private recordSkip(): void {
        this.summary.recordSkip();
    }

    private recordFailure(item: QueueItem<RemoteDataType>, error: unknown): void {
        this.summary.recordFailure(item.baseName, error, getItemUid(item));
    }
}

function getItemUid(item: QueueItem<unknown>): string | undefined {
    if ('remoteNode' in item) {
        return (item as QueueItem<{ remoteNode: NodeEntity }>).remoteNode.uid;
    }
    return undefined;
}

export class UploadQueue extends TransferQueue<{ parentNode: NodeEntity }> {
    async enqueueLocalPaths(localPaths: string[], parentNode: NodeEntity): Promise<void> {
        for (const localPath of localPaths) {
            const expanded = await resolveLocalPaths(localPath);
            for (const absolutePath of expanded) {
                await this.enqueueLocalPath(absolutePath, parentNode);
            }
        }
    }

    async enqueueLocalDirectoryChildren(absolutePath: string, parentNode: NodeEntity): Promise<void> {
        const parentStats = await lstat(absolutePath);
        assertLocalPathIsUploadable(absolutePath, parentStats);
        if (!parentStats.isDirectory()) {
            throw new ValidationError(`Not a directory: ${absolutePath}`);
        }
        const entries = await readdir(absolutePath, { withFileTypes: true });
        for (const ent of entries) {
            if (ent.name === '.' || ent.name === '..') {
                continue;
            }
            const childPath = path.join(absolutePath, ent.name);
            await this.enqueueLocalPath(childPath, parentNode, parentStats.dev);
        }
    }

    private async enqueueLocalPath(absolutePath: string, parentNode: NodeEntity, parentDevice?: number): Promise<void> {
        const stats = await lstat(absolutePath);
        assertLocalPathIsUploadable(absolutePath, stats);
        if (parentDevice !== undefined && stats.dev !== parentDevice) {
            throw new ValidationError(`Cannot traverse into a different file system (mount point): ${absolutePath}`);
        }
        const baseName = path.basename(absolutePath);
        if (stats.isDirectory()) {
            this.enqueueItem({ kind: 'directory', localPath: absolutePath, parentNode, baseName });
        } else if (stats.isFile()) {
            this.enqueueItem({ kind: 'file', localPath: absolutePath, parentNode, baseName });
        } else {
            throw new ValidationError(`Not a regular file or directory: ${absolutePath}`);
        }
    }
}

function assertLocalPathIsUploadable(absolutePath: string, stats: Stats): void {
    if (!stats.isFile() && !stats.isDirectory()) {
        throw new ValidationError(`Not a regular file or directory: ${absolutePath}`);
    }
}

export class DownloadQueue extends TransferQueue<{ remoteNode: NodeEntity }> {
    constructor(
        logger: Logger,
        summary: TransferSummary,
        private readonly sdk: ProtonDriveClient,
        handlers: TransferQueueHandlers<{ remoteNode: NodeEntity }>,
    ) {
        super(logger, summary, handlers);
    }

    async enqueueRemotePaths(
        remotePathStrings: string[],
        localDir: string,
        resolveRemoteNode: (pathString: string) => Promise<NodeEntity>,
    ): Promise<void> {
        const absoluteLocalDir = path.resolve(localDir);
        for (const pathString of remotePathStrings) {
            const node = await resolveRemoteNode(pathString);
            const baseName = sanitizePathSegmentForLocalFilesystem(getName(node));
            const targetPath = path.join(absoluteLocalDir, baseName);
            await this.enqueueRemoteNode(node, targetPath);
        }
    }

    async enqueueRemoteFolderChildren(folderRemoteNode: NodeEntity, localParentPath: string): Promise<void> {
        for await (const child of this.sdk.iterateFolderChildren(folderRemoteNode)) {
            const baseName = sanitizePathSegmentForLocalFilesystem(getName(child));
            const childPath = path.join(localParentPath, baseName);
            await this.enqueueRemoteNode(child, childPath);
        }
    }

    private async enqueueRemoteNode(node: NodeEntity, localPath: string): Promise<void> {
        const absolutePath = path.resolve(localPath);
        const baseName = path.basename(absolutePath);
        if (node.type === NodeType.Folder) {
            this.enqueueItem({ kind: 'directory', remoteNode: node, localPath: absolutePath, baseName });
        } else if (node.type === NodeType.File) {
            this.enqueueItem({ kind: 'file', remoteNode: node, localPath: absolutePath, baseName });
        } else {
            throw new ValidationError(`Unsupported node type for download: ${node.type}`);
        }
    }
}
