import {
    MaybeNode,
    NodeWithSameNameExistsValidationError,
    type ProtonDriveClient,
    ValidationError,
} from '@protontech/drive-sdk';

import { type ActionArgs, type Command, Options, PathType } from '../../cli';
import { getSha1 } from './digest';
import { generateThumbnails } from './generateThumbnails';
import { ConflictChoice, ConflictTargetKind, TransferConflictResolver } from './transferConflictResolver';
import { createTransferProgress, TransferProgressInterface } from './transferProgress';
import { type QueueItemDirectory, type QueueItemFile, UploadQueue } from './transferQueue';

const SUPPORTED_REMOTE_PATH_TYPES = [PathType.MyFiles, PathType.Devices, PathType.SharedWithMe];

type UploadContext = {
    sdk: ProtonDriveClient;
    json: boolean;
    skipThumbnails: boolean;
    progress?: TransferProgressInterface;
    uploadQueue: UploadQueue;
    conflictResolver: TransferConflictResolver;
};

export class CommandFileSystemUpload implements Command {
    group = 'filesystem';
    name = 'upload';
    args = ['localPath...', 'parentPath'];
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
            allowedValues: ['merge', 'keep-both', 'replace', 'skip'],
            help: 'Conflict strategy applied to files.',
        },
        'folder-conflict-strategy': {
            type: 'string',
            short: 'd',
            default: '',
            allowedValues: ['merge', 'keep-both', 'replace', 'skip'],
            help: 'Conflict strategy applied to folders.',
        },
        'skip-thumbnails': {
            type: 'boolean',
            short: 't',
            default: false,
            help: 'Skip generating thumbnails.',
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
            'skip-thumbnails': skipThumbnails,
        },
    }: ActionArgs) {
        if (args.length < 2) {
            throw new ValidationError('At least one local source and a remote parent path are required');
        }

        const localSources = args.slice(0, -1);
        const parentPathString = args[args.length - 1]!;

        if (!parentPathString.trim()) {
            throw new ValidationError('Remote parent path must not be empty');
        }

        if (localSources.some((p) => !p.trim())) {
            throw new ValidationError('Local source paths must not be empty');
        }

        const parentNode = await paths.getNode(parentPathString, SUPPORTED_REMOTE_PATH_TYPES);

        const progress = json ? undefined : createTransferProgress();

        const conflictResolver = new TransferConflictResolver(logger, {
            forcedFileStrategy: fileConflictStrategy || conflictStrategy,
            forcedFolderStrategy: folderConflictStrategy || conflictStrategy,
            disableInteractiveResolution: json,
            onInteractivePromptBegin: () => progress?.pause(),
            onInteractivePromptEnd: () => progress?.resume(),
        });

        const uploadQueue = new UploadQueue(logger, {
            onDirectory: async (item) => {
                const pending = await this.createFolder(ctx, item);
                if (pending) {
                    await ctx.uploadQueue.enqueueLocalDirectoryChildren(item.localPath, pending.node);
                }
            },
            startFile: async (item) => {
                await this.uploadFile(ctx, item);
            },
        });

        const ctx: UploadContext = {
            sdk,
            json,
            skipThumbnails,
            progress,
            uploadQueue,
            conflictResolver,
        };

        try {
            await ctx.uploadQueue.enqueueLocalPaths(localSources, parentNode);
            await ctx.uploadQueue.processQueue();
        } finally {
            progress?.dispose();
        }
    }

    private async createFolder(
        ctx: UploadContext,
        item: QueueItemDirectory<{ parentNode: MaybeNode }>,
    ): Promise<{ node: MaybeNode } | undefined> {
        let name = item.baseName;

        while (true) {
            try {
                const createdFolder = await ctx.sdk.createFolder(item.parentNode, name);
                return { node: createdFolder };
            } catch (error: unknown) {
                if (!(error instanceof NodeWithSameNameExistsValidationError)) {
                    throw error;
                }
                const existingNodeUid = error.existingNodeUid;
                if (!existingNodeUid) {
                    throw error;
                }

                const existingNode = await ctx.sdk.getNode(existingNodeUid);

                const choice = await ctx.conflictResolver.resolve(item.baseName, ConflictTargetKind.Folder);
                switch (choice) {
                    case ConflictChoice.Skip:
                        return;
                    case ConflictChoice.Merge:
                        return { node: existingNode };
                    case ConflictChoice.Replace:
                        await this.trashConflictingNode(ctx, existingNode);
                        continue;
                    case ConflictChoice.KeepBoth:
                        name = await ctx.sdk.getAvailableName(item.parentNode, item.baseName);
                        continue;
                    default:
                        throw new ValidationError(`Unexpected conflict choice: ${choice}`);
                }
            }
        }
    }

    private async uploadFile(ctx: UploadContext, item: QueueItemFile<{ parentNode: MaybeNode }>): Promise<void> {
        const expectedSha1 = await getSha1(item.localPath);
        const file = Bun.file(item.localPath);
        const metadata = {
            mediaType: file.type,
            expectedSize: file.size,
            expectedSha1,
            modificationTime: file.lastModified && file.lastModified !== 0 ? new Date(file.lastModified) : undefined,
            // additionalMetadata: TODO Implement before reusing for photos.
        };

        let name = item.baseName;
        let newRevisionForNodeUid: string | undefined;

        const thumbnails = ctx.skipThumbnails ? [] : await generateThumbnails(metadata.mediaType || '', item.localPath);

        while (true) {
            const progressTracker = ctx.progress?.trackItem(item.baseName, file.size);

            try {
                const uploader = newRevisionForNodeUid
                    ? await ctx.sdk.getFileRevisionUploader(newRevisionForNodeUid, metadata)
                    : await ctx.sdk.getFileUploader(item.parentNode, name, metadata);

                const controller = await uploader.uploadFromStream(file.stream(), thumbnails, (uploadedBytes) => {
                    // file.size is raw size while uploadedBytes is encrypted
                    // size. Encrypted size will be a bit higher. It is enough
                    // to cap the progress to 100%.
                    if (uploadedBytes <= file.size) {
                        progressTracker?.onProgress?.(uploadedBytes);
                    }
                });

                await controller.completion();
                return;
            } catch (error: unknown) {
                if (!(error instanceof NodeWithSameNameExistsValidationError)) {
                    throw error;
                }
                const existingNodeUid = error.existingNodeUid;
                if (!existingNodeUid) {
                    throw error;
                }
                const existingNode = await ctx.sdk.getNode(existingNodeUid);

                const choice = await ctx.conflictResolver.resolve(item.baseName, ConflictTargetKind.File);
                switch (choice) {
                    case ConflictChoice.Skip:
                        return;
                    case ConflictChoice.Merge:
                        newRevisionForNodeUid = existingNodeUid;
                        break;
                    case ConflictChoice.Replace:
                        await this.trashConflictingNode(ctx, existingNode);
                        break;
                    case ConflictChoice.KeepBoth:
                        name = await ctx.sdk.getAvailableName(item.parentNode, item.baseName);
                        break;
                    default:
                        throw new ValidationError(`Unexpected conflict choice: ${choice}`);
                }
            } finally {
                progressTracker?.onFinished();
            }
        }
    }

    private async trashConflictingNode(ctx: UploadContext, node: MaybeNode): Promise<void> {
        for await (const result of ctx.sdk.trashNodes([node])) {
            if (!result.ok) {
                throw result.error;
            }
        }
    }
}
