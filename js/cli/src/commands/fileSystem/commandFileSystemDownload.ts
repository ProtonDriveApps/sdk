import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
    FileDownloader,
    IntegrityError,
    type Logger,
    NodeEntity,
    type ProtonDriveClient,
    ValidationError,
} from '@protontech/drive-sdk';

import { type ActionArgs, type Command, getClaimedSize, Options, PathType } from '../../cli';
import type { CliMetrics } from '../../telemetry';
import { getSha1 } from './digest';
import { assertDownloadDestination, assertValidDownloadRoot, assertValidPathSegment } from './downloadPathValidation';
import { resolveLocalPaths } from './localPath';
import {
    ConflictChoice,
    ConflictTargetKind,
    TransferConflictResolver,
} from './transferConflictResolver';
import { createTransferProgress, TransferProgressInterface } from './transferProgress';
import { DownloadQueue, type QueueItemDirectory, type QueueItemFile } from './transferQueue';
import { TransferSummary } from './transferSummary';

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
    metrics?: CliMetrics;
};

export class CommandFileSystemDownload implements Command {
    group = 'filesystem';
    name = 'download';
    help = 'Downloads files and folders. It prompts for conflict resolution unless a strategy option is set.';
    args = ['path...', 'localFolder'];
    options: Options = {
        'conflict-strategy': {
            type: 'string',
            short: 'c',
            default: '',
            allowedValues: ['merge', 'keep-both', 'replace', 'skip'],
            help: 'Conflict strategy applied to all files and folders.',
        },
        'file-conflict-strategy': {
            type: 'string',
            short: 'f',
            default: '',
            allowedValues: ['keep-both', 'replace', 'skip'],
            help: 'Conflict strategy applied to files.',
        },
        'folder-conflict-strategy': {
            type: 'string',
            short: 'd',
            default: '',
            allowedValues: ['merge', 'keep-both', 'replace', 'skip'],
            help: 'Conflict strategy applied to folders.',
        },
    };

    async action({
        logger,
        sdk,
        paths,
        metrics,
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

        const resolvedLocalPaths = await resolveLocalPaths(localFolder);
        if (resolvedLocalPaths.length !== 1) {
            throw new ValidationError('Expected exactly one local path');
        }
        const downloadRoot = assertValidDownloadRoot(resolvedLocalPaths[0]);
        await ensureDirectory(downloadRoot);

        const summary = new TransferSummary('download');
        const progress = json ? undefined : createTransferProgress(() => summary.formatProgressLine());

        const conflictResolver = new TransferConflictResolver(logger, {
            fileStrategyChoices: FILE_DOWNLOAD_CONFLICT_STRATEGIES,
            forcedFileStrategy: fileConflictStrategy || conflictStrategy,
            forcedFolderStrategy: folderConflictStrategy || conflictStrategy,
            disableInteractiveResolution: json,
            onInteractivePromptBegin: () => progress?.pause(),
            onInteractivePromptEnd: () => progress?.resume(),
        });

        const downloadQueue = new DownloadQueue(logger, summary, sdk, {
            onDirectory: async (item) => {
                const createdPath = await this.createLocalFolder(ctx, item);
                if (createdPath) {
                    await ctx.downloadQueue.enqueueRemoteFolderChildren(item.remoteNode, createdPath);
                    return true;
                }
                return false;
            },
            startFile: async (item) => {
                return await this.downloadFile(ctx, item);
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
            metrics,
        };

        try {
            await downloadQueue.enqueueRemotePaths(remotePathStrings, downloadRoot, (pathString) =>
                paths.getNode(pathString, SUPPORTED_REMOTE_PATH_TYPES),
            );

            await downloadQueue.processQueue();
        } finally {
            progress?.dispose();
            summary.print({ json });
        }

        if (summary.failureCount > 0) {
            throw new ValidationError(`${summary.failureCount} item(s) failed to download`);
        }
    }

    private async createLocalFolder(
        ctx: DownloadContext,
        item: QueueItemDirectory<{ remoteNode: NodeEntity }>,
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

    private async downloadFile(
        ctx: DownloadContext,
        item: QueueItemFile<{ remoteNode: NodeEntity }>,
    ): Promise<number | false> {
        const parentPath = path.dirname(item.localPath);
        let targetPath = item.localPath;
        let name = item.baseName;

        assertDownloadDestination(ctx.downloadRoot, parentPath);

        await ensureDirectory(parentPath);

        while (true) {
            assertValidPathSegment(name);
            assertDownloadDestination(ctx.downloadRoot, targetPath);

            const st = await stat(targetPath).catch(() => undefined);
            if (st) {
                const choice = await ctx.conflictResolver.resolve(name, ConflictTargetKind.File);
                switch (choice) {
                    case ConflictChoice.Skip:
                        return false;
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

            const claimedDigests = item.remoteNode.activeRevision?.ok
                ? item.remoteNode.activeRevision.value.claimedDigests
                : undefined;
            const verification = {
                expectedSha1: claimedDigests?.sha1,
                sha1Verified: !!claimedDigests?.sha1Verified,
                fileSize: getClaimedSize(item.remoteNode) ?? 0,
            };

            const downloader = await ctx.sdk.getFileDownloader(item.remoteNode);
            const fileSize = await this.downloadToPath(ctx, item, downloader, targetPath, verification);
            return fileSize;
        }
    }

    private async downloadToPath(
        ctx: DownloadContext,
        item: QueueItemFile<{ remoteNode: NodeEntity }>,
        downloader: FileDownloader,
        localPath: string,
        verification: { expectedSha1?: string; sha1Verified: boolean; fileSize: number },
    ): Promise<number> {
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

        const progressTracker = ctx.progress?.trackItem(item.baseName, verification.fileSize);

        const controller = downloader.downloadToStream(writableStream, (downloadedBytes) => {
            progressTracker?.onProgress?.(downloadedBytes);
        });

        try {
            await controller.completion();
            await writer.end();
            await this.verifyDownload(ctx, localPath, verification);
        } catch (error: unknown) {
            await unlink(localPath).catch(() => {});
            await writer.end(error instanceof Error ? error : new Error('Unknown error', { cause: error }));
            throw error;
        } finally {
            progressTracker?.onFinished();
        }

        return file.size;
    }

    private async verifyDownload(
        ctx: DownloadContext,
        localPath: string,
        verification: { expectedSha1?: string; sha1Verified: boolean; fileSize: number },
    ): Promise<void> {
        const { expectedSha1, sha1Verified, fileSize } = verification;

        if (!expectedSha1) {
            ctx.metrics?.reportDownloadVerifierAttempt({
                result: 'skipped',
                fileSize,
                checksumVerified: false,
            });
            return;
        }

        const computedSha1 = await getSha1(localPath);
        const matches = computedSha1 === expectedSha1;

        ctx.metrics?.reportDownloadVerifierAttempt({
            result: matches ? 'success' : 'failure',
            fileSize,
            checksumVerified: sha1Verified,
        });

        if (!matches && sha1Verified) {
            ctx.logger.error(
                `Integrity verification failed: computedSha1=${computedSha1} expectedSha1=${expectedSha1}`,
            );
            throw new IntegrityError('Integrity verification failed', {
                computedSha1,
                expectedSha1,
            });
        }
    }
}

async function ensureDirectory(dirPath: string): Promise<void> {
    try {
        // mkdir should not throw when the path already exists, but there is a bug in Bun on Windows
        await mkdir(dirPath, { recursive: true });
    } catch (error: unknown) {
        if (!isEexistError(error)) {
            throw error;
        }
        const st = await stat(dirPath);
        if (!st.isDirectory()) {
            throw error;
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
