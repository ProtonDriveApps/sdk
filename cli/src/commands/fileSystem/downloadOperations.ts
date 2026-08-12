import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
    FileDownloader,
    IntegrityError,
    type Logger,
    NodeEntity,
    ValidationError,
} from '@protontech/drive-sdk';
import { isProtonDocument, isProtonSheet } from '@protontech/drive-sdk/internal/nodes/mediaTypes';

import { getClaimedSize } from '../../cli';
import type { CliMetrics } from '../../telemetry';
import { getSha1 } from './digest';
import { assertDownloadDestination, assertValidPathSegment } from './downloadPathValidation';
import {
    ConflictChoice,
    ConflictTargetKind,
    TransferConflictResolver,
} from './transferConflictResolver';
import { TransferProgressInterface } from './transferProgress';
import { type QueueItemDirectory, type QueueItemFile } from './transferQueue';

export type DownloadContext = {
    logger: Logger;
    progress?: TransferProgressInterface;
    conflictResolver: TransferConflictResolver;
    downloadRoot: string;
    metrics?: CliMetrics;
    getFileDownloader: (node: NodeEntity) => Promise<FileDownloader>;
};

export async function createLocalFolder(
    ctx: Pick<DownloadContext, 'downloadRoot' | 'conflictResolver'>,
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
                case ConflictChoice.DeleteLocal:
                    await rm(targetPath, { recursive: true, force: true });
                    continue;
                case ConflictChoice.Rename:
                    name = await getAvailableLocalName(parentPath, name);
                    targetPath = path.join(parentPath, name);
                    continue;
                default:
                    throw new ValidationError(`Unexpected conflict choice: ${choice}`);
            }
        }
    }
}

export async function downloadRemoteFile(
    ctx: DownloadContext,
    item: QueueItemFile<{ remoteNode: NodeEntity }>,
): Promise<number | false> {
    if (isProtonDocument(item.remoteNode.mediaType) || isProtonSheet(item.remoteNode.mediaType)
    ) {
        return false;
    }

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
                case ConflictChoice.DeleteLocal:
                    await unlink(targetPath);
                    break;
                case ConflictChoice.Rename:
                    name = await getAvailableLocalName(parentPath, name);
                    targetPath = path.join(parentPath, name);
                    continue;
                default:
                    throw new ValidationError(`Unexpected conflict choice: ${choice}`);
            }
        }

        const claimedDigests = item.remoteNode.activeRevision?.claimedDigests;
        const verification = {
            expectedSha1: claimedDigests?.sha1,
            sha1Verified: !!claimedDigests?.sha1Verified,
            fileSize: getClaimedSize(item.remoteNode) ?? 0,
        };

        const downloader = await ctx.getFileDownloader(item.remoteNode);
        const fileSize = await downloadToPath(ctx, item, downloader, targetPath, verification);
        return fileSize;
    }
}

async function downloadToPath(
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
        await verifyDownload(ctx, localPath, verification);
    } catch (error: unknown) {
        await unlink(localPath).catch((unlinkError) => {
            ctx.logger.error(`Failed to delete local file: ${localPath}`, unlinkError);
        });
        await writer.end(error instanceof Error ? error : new Error('Unknown error', { cause: error }));
        throw error;
    } finally {
        progressTracker?.onFinished();
    }

    return file.size;
}

async function verifyDownload(
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
        ctx.logger.error(`Integrity verification failed: computedSha1=${computedSha1} expectedSha1=${expectedSha1}`);
        throw new IntegrityError('Integrity verification failed', {
            computedSha1,
            expectedSha1,
        });
    }
}

export async function ensureDirectory(dirPath: string): Promise<void> {
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
