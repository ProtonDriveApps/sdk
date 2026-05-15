import type { Stats } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Logger, MaybeNode, NodeType, ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';

import { getName, getNode } from '../../cli';
import { resolveLocalPaths } from './localPath';

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
    onDirectory: (item: QueueItemDirectory<RemoteDataType>) => Promise<void>;
    startFile: (item: QueueItemFile<RemoteDataType>) => Promise<void>;
};

class TransferQueue<RemoteDataType> {
    protected queue: QueueItem<RemoteDataType>[] = [];
    private ongoingItems = new Set<Promise<void>>();

    constructor(
        private readonly logger: Logger,
        private readonly handlers: TransferQueueHandlers<RemoteDataType>,
    ) {}

    async processQueue(): Promise<void> {
        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            if (item.kind === 'directory') {
                await this.handlers.onDirectory(item);
                continue;
            }

            if (this.ongoingItems.size >= MAX_CONCURRENT_ITEMS) {
                this.logger.debug(`Waiting for ongoing items to finish`);
                await Promise.race(this.ongoingItems);
            }
            const promise = this.handlers.startFile(item);
            this.ongoingItems.add(promise);
            void promise.finally(() => {
                this.ongoingItems.delete(promise);
            });
        }
        await Promise.all(this.ongoingItems);
    }
}

export class UploadQueue extends TransferQueue<{ parentNode: MaybeNode }> {
    async enqueueLocalPaths(localPaths: string[], parentNode: MaybeNode): Promise<void> {
        for (const localPath of localPaths) {
            const expanded = await resolveLocalPaths(localPath);
            for (const absolutePath of expanded) {
                await this.enqueueLocalPath(absolutePath, parentNode);
            }
        }
    }

    async enqueueLocalDirectoryChildren(absolutePath: string, parentNode: MaybeNode): Promise<void> {
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

    private async enqueueLocalPath(absolutePath: string, parentNode: MaybeNode, parentDevice?: number): Promise<void> {
        const stats = await lstat(absolutePath);
        assertLocalPathIsUploadable(absolutePath, stats);
        if (parentDevice !== undefined && stats.dev !== parentDevice) {
            throw new ValidationError(`Cannot traverse into a different file system (mount point): ${absolutePath}`);
        }
        const baseName = path.basename(absolutePath);
        if (stats.isDirectory()) {
            this.queue.push({ kind: 'directory', localPath: absolutePath, parentNode, baseName });
        } else if (stats.isFile()) {
            this.queue.push({ kind: 'file', localPath: absolutePath, parentNode, baseName });
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

export class DownloadQueue extends TransferQueue<{ remoteNode: MaybeNode }> {
    constructor(
        logger: Logger,
        private readonly sdk: ProtonDriveClient,
        handlers: TransferQueueHandlers<{ remoteNode: MaybeNode }>,
    ) {
        super(logger, handlers);
    }

    async enqueueRemotePaths(
        remotePathStrings: string[],
        localDir: string,
        resolveRemoteNode: (pathString: string) => Promise<MaybeNode>,
    ): Promise<void> {
        const absoluteLocalDir = path.resolve(localDir);
        for (const pathString of remotePathStrings) {
            const node = await resolveRemoteNode(pathString);
            const baseName = getName(node);
            const targetPath = path.join(absoluteLocalDir, baseName);
            await this.enqueueRemoteNode(node, targetPath);
        }
    }

    async enqueueRemoteFolderChildren(folderRemoteNode: MaybeNode, localParentPath: string): Promise<void> {
        for await (const child of this.sdk.iterateFolderChildren(folderRemoteNode)) {
            const baseName = getName(child);
            const childPath = path.join(localParentPath, baseName);
            await this.enqueueRemoteNode(child, childPath);
        }
    }

    private async enqueueRemoteNode(node: MaybeNode, localPath: string): Promise<void> {
        const absolutePath = path.resolve(localPath);
        const baseName = path.basename(absolutePath);
        const type = getNode(node).type;
        if (type === NodeType.Folder) {
            this.queue.push({ kind: 'directory', remoteNode: node, localPath: absolutePath, baseName });
        } else if (type === NodeType.File) {
            this.queue.push({ kind: 'file', remoteNode: node, localPath: absolutePath, baseName });
        } else {
            throw new ValidationError(`Unsupported node type for download: ${type}`);
        }
    }
}
