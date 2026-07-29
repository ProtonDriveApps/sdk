import path from 'node:path';

import { Logger, NodeEntity, NodeType, ValidationError } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, getName, Options, Paths, PathType } from '../../cli';
import {
    createLocalFolder,
    type DownloadContext,
    downloadRemoteFile,
    ensureDirectory,
} from '../fileSystem/downloadOperations';
import { assertValidDownloadRoot, sanitizePathSegmentForLocalFilesystem } from '../fileSystem/downloadPathValidation';
import { resolveLocalPaths } from '../fileSystem/localPath';
import { ConflictChoice, TransferConflictResolver } from '../fileSystem/transferConflictResolver';
import { createTransferProgress } from '../fileSystem/transferProgress';
import { TransferQueue, TransferQueueHandlers } from '../fileSystem/transferQueue';
import { TransferSummary } from '../fileSystem/transferSummary';

const SUPPORTED_REMOTE_PATH_TYPES = [PathType.Photos, PathType.PhotosSharedWithMe, PathType.Albums];

const FILE_DOWNLOAD_CONFLICT_STRATEGIES = [ConflictChoice.Skip, ConflictChoice.Replace, ConflictChoice.KeepBoth];

export class CommandPhotoDownload implements Command {
    group = 'photo';
    name = 'download';
    help = 'Downloads photos. It prompts for conflict resolution unless a strategy option is set.';
    args = ['path...', 'localFolder'];
    options: Options = {
        'conflict-strategy': {
            type: 'string',
            short: 'c',
            default: '',
            allowedValues: FILE_DOWNLOAD_CONFLICT_STRATEGIES,
            help: 'Conflict strategy applied to all files and folders. Note, there can be multiple images with the same name in the photos timeline. If selecting overwrite or skip as strategy, only one of the images will be kept.',
        },
    };

    async action({
        logger,
        photosSdk,
        paths,
        metrics,
        args,
        options: { json, 'conflict-strategy': conflictStrategy },
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
            forcedFileStrategy: conflictStrategy,
            forcedFolderStrategy: conflictStrategy,
            disableInteractiveResolution: json,
            onInteractivePromptBegin: () => progress?.pause(),
            onInteractivePromptEnd: () => progress?.resume(),
        });

        const ctx: DownloadContext = {
            logger,
            progress,
            conflictResolver,
            downloadRoot,
            metrics,
            getFileDownloader: (node) => photosSdk.getFileDownloader(node),
        };

        const downloadQueue = new PhotosDownloadQueue(logger, summary, photosSdk, {
            onDirectory: async (item) => {
                const createdPath = await createLocalFolder(ctx, item);
                if (createdPath) {
                    if (item.remoteNode.type === NodeType.Album) {
                        await downloadQueue.enqueueAlbumPhotos(item.remoteNode, createdPath);
                    } else {
                        await downloadQueue.enqueueMyPhotosRoot(createdPath);
                    }
                }
                // Do not report root or albums in the final summary.
                return undefined;
            },
            startFile: async (item) => {
                return await downloadRemoteFile(ctx, item);
            },
        });

        try {
            await downloadQueue.enqueuePhotoPaths(remotePathStrings, downloadRoot, paths);
            await downloadQueue.processQueue();
        } finally {
            progress?.dispose();
            summary.print({ json });
        }

        if (summary.failureCount > 0) {
            throw new ValidationError(`${summary.failureCount} item(s) failed to download`);
        }
    }
}

class PhotosDownloadQueue extends TransferQueue<{ remoteNode: NodeEntity }> {
    constructor(
        logger: Logger,
        summary: TransferSummary,
        private readonly photosSdk: ProtonDrivePhotosClient,
        handlers: TransferQueueHandlers<{ remoteNode: NodeEntity }>,
    ) {
        super(logger, summary, handlers);
    }

    async enqueuePhotoPaths(remotePathStrings: string[], localDir: string, paths: Paths): Promise<void> {
        const absoluteLocalDir = path.resolve(localDir);
        for (const pathString of remotePathStrings) {
            const pathObj = paths.getPath(pathString, SUPPORTED_REMOTE_PATH_TYPES);

            let node: NodeEntity;
            if (pathObj.fullPath === `/${PathType.Photos}`) {
                node = await this.photosSdk.getMyPhotosRootFolder();
            } else {
                node = await pathObj.getNode();
            }

            const baseName = sanitizePathSegmentForLocalFilesystem(getName(node));
            await this.enqueuePhotoNode(node, path.join(absoluteLocalDir, baseName));
        }
    }

    async enqueueMyPhotosRoot(localParentPath: string): Promise<void> {
        const nodeUids = await Array.fromAsync(this.photosSdk.iterateTimeline(), (photo) => photo.nodeUid);
        for await (const node of this.photosSdk.iterateNodes(nodeUids)) {
            if ('missingUid' in node) {
                continue;
            }
            const baseName = sanitizePathSegmentForLocalFilesystem(getName(node));
            await this.enqueuePhotoNode(node, path.join(localParentPath, baseName));
        }
    }

    async enqueueAlbumPhotos(albumNode: NodeEntity, localParentPath: string): Promise<void> {
        const nodeUids = await Array.fromAsync(this.photosSdk.iterateAlbum(albumNode.uid), (photo) => photo.nodeUid);
        for await (const node of this.photosSdk.iterateNodes(nodeUids)) {
            if ('missingUid' in node) {
                continue;
            }
            const baseName = sanitizePathSegmentForLocalFilesystem(getName(node));
            await this.enqueuePhotoNode(node, path.join(localParentPath, baseName));
        }
    }

    private async enqueuePhotoNode(node: NodeEntity, localPath: string): Promise<void> {
        const absolutePath = path.resolve(localPath);
        const baseName = path.basename(absolutePath);
        if (node.type === NodeType.Album || node.type === NodeType.Folder) {
            this.enqueueItem({ kind: 'directory', remoteNode: node, localPath: absolutePath, baseName });
        } else if (node.type === NodeType.Photo) {
            this.enqueueItem({ kind: 'file', remoteNode: node, localPath: absolutePath, baseName });
        } else {
            throw new ValidationError(`Unsupported node type for download: ${node.type}`);
        }
    }
}
