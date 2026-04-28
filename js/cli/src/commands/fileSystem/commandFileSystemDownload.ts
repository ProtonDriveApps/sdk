import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ParseArgsConfig } from 'node:util';

import { FileDownloader, IntegrityError, type Logger, MaybeNode, type ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, getClaimedSize, PathType } from '../../cli';
import { getSha1 } from './digest';
import { assertDownloadDestination, assertValidDownloadRoot, assertValidPathSegment } from './downloadPathValidation';
import {
    ConflictChoice,
    ConflictTargetKind,
    TransferConflictResolver,
} from './transferConflictResolver';
import { createTransferProgress, TransferProgressInterface } from './transferProgress';
import { DownloadQueue, type QueueItemDirectory, type QueueItemFile } from './transferQueue';

const SUPPORTED_REMOTE_PATH_TYPES = [PathType.MyFiles, PathType.Devices, PathType.SharedWithMe];

const FILE_DOWNLOAD_CONFLICT_STRATEGIES = [
    ConflictChoice.Skip,
    ConflictChoice.Replace,
    ConflictChoice.KeepBoth,
];

type DownloadContext = {
    logger: Logger;
    sdk: ProtonDriveClient;
    json: boolean;
    progress?: TransferProgressInterface;
    downloadQueue: DownloadQueue;
    conflictResolver: TransferConflictResolver;
    downloadRoot: string;
};

export class CommandFileSystemDownload implements Command {
    group = 'filesystem';
    name = 'download';
    args = ['remotes...', 'localFolder'];
    options: ParseArgsConfig['options'] = {
        'conflict-strategy': {
            type: 'string',
            short: 'c',
            default: '',
        },
        'file-conflict-strategy': {
            type: 'string',
            short: 'f',
            default: '',
        },
        'folder-conflict-strategy': {
            type: 'string',
            short: 'd',
            default: '',
        },
    };

    async action({
        logger,
        sdk,
        paths,
        args,
        options: {
            json,
            'conflict-strategy': conflictStrategy,
            'file-conflict-strategy': fileConflictStrategy,
            'folder-conflict-strategy': folderConflictStrategy,
        },
    }: ActionArgs) {
        const remotePathStrings = args.slice(0, -1);
        const localFolder = args[args.length - 1]!;

        if (remotePathStrings.length === 0) {
            throw new ValidationError('At least one remote path and a local folder are required');
        }

        const downloadRoot = assertValidDownloadRoot(localFolder);
        await mkdir(downloadRoot, { recursive: true });

        const progress = json ? undefined : createTransferProgress();

        const conflictResolver = new TransferConflictResolver(logger, {
            fileStrategyChoices: FILE_DOWNLOAD_CONFLICT_STRATEGIES,
            forcedFileStrategy: fileConflictStrategy || conflictStrategy,
            forcedFolderStrategy: folderConflictStrategy || conflictStrategy,
            disableInteractiveResolution: json,
            onInteractivePromptBegin: () => progress?.pause(),
            onInteractivePromptEnd: () => progress?.resume(),
        });

        const downloadQueue = new DownloadQueue(logger, sdk, {
            onDirectory: async (item) => {
                const createdPath = await this.createLocalFolder(ctx, item);
                if (createdPath) {
                    await ctx.downloadQueue.enqueueRemoteFolderChildren(item.remoteNode, createdPath);
                }
            },
            startFile: async (item) => {
                await this.downloadFile(ctx, item);
            },
        });

        const ctx: DownloadContext = {
            logger,
            sdk,
            json,
            progress,
            downloadQueue,
            conflictResolver,
            downloadRoot,
        };

        try {
            await downloadQueue.enqueueRemotePaths(remotePathStrings, downloadRoot, (pathString) =>
                paths.getNode(pathString, SUPPORTED_REMOTE_PATH_TYPES),
            );

            await downloadQueue.processQueue();
        } finally {
            progress?.dispose();
        }
    }

    private async createLocalFolder(
        ctx: DownloadContext,
        item: QueueItemDirectory<{ remoteNode: MaybeNode }>,
    ): Promise<string | undefined> {
        const parentPath = path.dirname(item.localPath);
        let targetPath = item.localPath;
        let name = item.baseName;

        while (true) {
            assertValidPathSegment(name);
            assertDownloadDestination(ctx.downloadRoot, targetPath);

            try {
                await mkdir(targetPath);
                return targetPath;
            } catch (error: unknown) {
                if (!isEexistError(error)) {
                    throw error;
                }

                const choice = await ctx.conflictResolver.resolve(name, ConflictTargetKind.Folder);
                switch (choice) {
                    case ConflictChoice.Skip:
                        return;
                    case ConflictChoice.Merge:
                        return targetPath;
                    case ConflictChoice.Replace:
                        await rm(targetPath, { recursive: true, force: true });
                        continue;
                    case ConflictChoice.KeepBoth:
                        name = await getAvailableLocalName(parentPath, name);
                        targetPath = path.join(parentPath, name);
                        continue;
                    default:
                        throw new ValidationError(`Unexpected conflict choice: ${choice}`);
                }
            }
        }
    }

    private async downloadFile(ctx: DownloadContext, item: QueueItemFile<{ remoteNode: MaybeNode }>): Promise<void> {
        const parentPath = path.dirname(item.localPath);
        let targetPath = item.localPath;
        let name = item.baseName;

        assertDownloadDestination(ctx.downloadRoot, parentPath);

        await mkdir(parentPath, { recursive: true });

        while (true) {
            assertValidPathSegment(name);
            assertDownloadDestination(ctx.downloadRoot, targetPath);

            const st = await stat(targetPath).catch(() => undefined);
            if (st) {
                const choice = await ctx.conflictResolver.resolve(name, ConflictTargetKind.File);
                switch (choice) {
                    case ConflictChoice.Skip:
                        return;
                    case ConflictChoice.Replace:
                        await unlink(targetPath);
                        break;
                    case ConflictChoice.KeepBoth:
                        name = await getAvailableLocalName(parentPath, name);
                        targetPath = path.join(parentPath, name);
                        continue;
                    default:
                        throw new ValidationError(`Unexpected conflict choice: ${choice}`);
                }
            }

            const expectedSha1 =
                item.remoteNode.ok && item.remoteNode.value.activeRevision?.claimedDigests?.sha1Verified
                    ? item.remoteNode.value.activeRevision?.claimedDigests?.sha1
                    : undefined;

            const downloader = await ctx.sdk.getFileDownloader(item.remoteNode);
            await this.downloadToPath(ctx, item, downloader, targetPath, expectedSha1);
            return;
        }
    }

    private async downloadToPath(
        ctx: DownloadContext,
        item: QueueItemFile<{ remoteNode: MaybeNode }>,
        downloader: FileDownloader,
        localPath: string,
        expectedSha1: string | undefined,
    ): Promise<void> {
        assertDownloadDestination(ctx.downloadRoot, localPath);

        const file = Bun.file(localPath);
        const writer = file.writer();
        const writableStream: WritableStream = {
            // @ts-expect-error: Bun's FileSink writer is not fully compatible with WritableStream.
            getWriter: () => writer,
            close: async () => {
                await writer.end();
            },
            abort: async () => {
                await writer.end();
                await unlink(localPath).catch(() => {});
            },
            locked: false,
        };

        const claimedSize = getClaimedSize(item.remoteNode);
        const progressTracker = ctx.progress?.trackItem(item.baseName, claimedSize);

        const controller = downloader.downloadToStream(writableStream, (downloadedBytes) => {
            progressTracker?.onProgress?.(downloadedBytes);
        });

        try {
            await controller.completion();
            await writer.end();

            if (expectedSha1) {
                const computedSha1 = await getSha1(localPath);
                if (computedSha1 !== expectedSha1) {
                    ctx.logger.error(
                        `Integrity verification failed: computedSha1=${computedSha1} expectedSha1=${expectedSha1}`,
                    );
                    throw new IntegrityError('Integrity verification failed', {
                        computedSha1,
                        expectedSha1,
                    });
                }
            }
        } catch (error: unknown) {
            await unlink(localPath).catch(() => {});
            await writer.end(error instanceof Error ? error : new Error('Unknown error', { cause: error }));
            throw error;
        } finally {
            progressTracker?.onFinished();
        }
    }
}

function isEexistError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST';
}

async function getAvailableLocalName(parentDir: string, baseName: string): Promise<string> {
    let entries: string[];
    try {
        entries = await readdir(parentDir);
    } catch {
        return baseName;
    }
    if (!entries.includes(baseName)) {
        return baseName;
    }
    const dot = baseName.lastIndexOf('.');
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const ext = dot > 0 ? baseName.slice(dot) : '';
    let i = 1;
    while (true) {
        const candidate = `${stem} (${i})${ext}`;
        if (!entries.includes(candidate)) {
            return candidate;
        }
        i++;
    }
}
