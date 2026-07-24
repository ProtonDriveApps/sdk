import {
    Logger,
    NodeEntity,
    ValidationError,
} from '@protontech/drive-sdk';
import { generateAdditionalPhotoNodeMetadata } from '@protontech/drive-sdk/additionalNodeMetadata';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, Options } from '../../cli';
import type { CliMetrics } from '../../telemetry';
import { createUploadProgressCallback, getFileMetadata } from '../fileSystem/commandFileSystemUpload';
import { getLocalFileMediaType } from '../fileSystem/mediaType';
import { ConflictChoice, ConflictTargetKind, TransferConflictResolver } from '../fileSystem/transferConflictResolver';
import { createTransferProgress, TransferProgressInterface } from '../fileSystem/transferProgress';
import { type QueueItemFile, UploadQueue } from '../fileSystem/transferQueue';
import { TransferSummary } from '../fileSystem/transferSummary';

type PhotosUploadContext = {
    logger: Logger;
    photosSdk: ProtonDrivePhotosClient;
    volumeRootFolder: NodeEntity;
    json: boolean;
    skipThumbnails: boolean;
    progress?: TransferProgressInterface;
    uploadQueue: UploadQueue;
    conflictResolver: TransferConflictResolver;
    metrics?: CliMetrics;
};

export class CommandPhotoUpload implements Command {
    group = 'photo';
    name = 'upload';
    help =
        'Uploads photos from local files and folders to My Photos. Folder structure is flattened. It prompts for conflict resolution unless a strategy option is set.';
    args = ['localPath...'];
    options: Options = {
        'conflict-strategy': {
            type: 'string',
            short: 'c',
            default: '',
            allowedValues: ['keep-both', 'skip'],
            help: 'Conflict strategy applied to duplicate photos.',
        },
    };

    async action({
        logger,
        photosSdk,
        metrics,
        args: localSources,
        options: { json, 'conflict-strategy': conflictStrategy },
    }: ActionArgs) {
        if (localSources.length === 0) {
            throw new ValidationError('At least one local source path is required');
        }

        if (localSources.some((p) => !p.trim())) {
            throw new ValidationError('Local source paths must not be empty');
        }

        const volumeRootFolder = await photosSdk.getMyPhotosRootFolder();

        const summary = new TransferSummary('upload');
        const progress = json ? undefined : createTransferProgress(() => summary.formatProgressLine());

        const conflictResolver = new TransferConflictResolver(logger, {
            fileStrategyChoices: [ConflictChoice.KeepBoth, ConflictChoice.Skip],
            forcedFileStrategy: conflictStrategy,
            disableInteractiveResolution: json,
            onInteractivePromptBegin: () => progress?.pause(),
            onInteractivePromptEnd: () => progress?.resume(),
        });

        const uploadQueue = new UploadQueue(logger, summary, {
            onDirectory: async (item) => {
                await ctx.uploadQueue.enqueueLocalDirectoryChildren(item.localPath, volumeRootFolder);
                return undefined;
            },
            startFile: async (item) => {
                const mediaType = getLocalFileMediaType(ctx.logger, item.localPath);
                if (!isPhotoMediaType(mediaType)) {
                    return false;
                }
                return await this.uploadPhoto(ctx, item, mediaType);
            },
        });

        const ctx: PhotosUploadContext = {
            logger,
            photosSdk,
            volumeRootFolder,
            json,
            // Do not allow skipping thumbnails for photo timeline as the product is not usable without them.
            skipThumbnails: false,
            progress,
            uploadQueue,
            conflictResolver,
            metrics,
        };

        try {
            await ctx.uploadQueue.enqueueLocalPaths(localSources, volumeRootFolder);
            await ctx.uploadQueue.processQueue();
        } finally {
            progress?.dispose();
            summary.print({ json });
        }

        if (summary.failureCount > 0) {
            throw new ValidationError(`${summary.failureCount} item(s) failed to upload`);
        }
    }

    private async uploadPhoto(
        ctx: PhotosUploadContext,
        item: QueueItemFile<{ parentNode: NodeEntity }>,
        mediaType: string,
    ): Promise<number | false> {
        const { file, metadata, thumbnails } = await getFileMetadata(ctx, item, mediaType, (file) =>
            generateAdditionalPhotoNodeMetadata(file, mediaType, undefined, ctx.logger),
        );

        let name = item.baseName;

        while (true) {
            const duplicateNodeUids = await ctx.photosSdk.findPhotoDuplicates(name, () =>
                Promise.resolve(metadata.expectedSha1),
            );
            if (duplicateNodeUids.length > 0) {
                const choice = await ctx.conflictResolver.resolve(item.baseName, ConflictTargetKind.File);
                switch (choice) {
                    case ConflictChoice.Skip:
                        return false;
                    case ConflictChoice.KeepBoth:
                        name = await ctx.photosSdk.getAvailableName(ctx.volumeRootFolder, name);
                        continue;
                    default:
                        throw new ValidationError(`Unexpected conflict choice: ${choice}`);
                }
            }

            const progressTracker = ctx.progress?.trackItem(item.baseName, file.size);

            try {
                const uploader = await ctx.photosSdk.getFileUploader(name, metadata);
                const controller = await uploader.uploadFromStream(
                    file.stream(),
                    thumbnails,
                    createUploadProgressCallback(file.size, progressTracker),
                );

                await controller.completion();
                ctx.metrics?.reportUploadVerifierAttempt();
                return file.size;
            } finally {
                progressTracker?.onFinished();
            }
        }
    }
}

function isPhotoMediaType(mediaType: string): boolean {
    return mediaType.startsWith('image/') || mediaType.startsWith('video/');
}
