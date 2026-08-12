import { ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, Options, PathType } from '../../cli';
import { createLocalFolder, type DownloadContext, downloadRemoteFile, ensureDirectory } from './downloadOperations';
import { assertValidDownloadRoot } from './downloadPathValidation';
import { resolveLocalPaths } from './localPath';
import { ConflictChoice, getConflictChoicesHelp, TransferConflictResolver } from './transferConflictResolver';
import { createTransferProgress } from './transferProgress';
import { DownloadQueue } from './transferQueue';
import { TransferSummary } from './transferSummary';

const SUPPORTED_REMOTE_PATH_TYPES = [PathType.MyFiles, PathType.Devices, PathType.SharedWithMe];

const FILE_CONFLICT_STRATEGIES = [ConflictChoice.Rename, ConflictChoice.DeleteLocal, ConflictChoice.Skip];
const FOLDER_CONFLICT_STRATEGIES = [
    ConflictChoice.Merge,
    ConflictChoice.Rename,
    ConflictChoice.DeleteLocal,
    ConflictChoice.Skip,
];

export class CommandFileSystemDownload implements Command {
    group = 'filesystem';
    name = 'download';
    help =
        'Downloads files and folders. It prompts for conflict resolution unless a strategy option is set. Proton Docs or Sheets will be skipped.';
    args = ['path...', 'localFolder'];
    options: Options = {
        'file-conflict-strategy': {
            type: 'string',
            short: 'f',
            default: '',
            allowedValues: getConflictChoicesHelp(FILE_CONFLICT_STRATEGIES),
            help: 'Conflict strategy applied to files.',
        },
        'folder-conflict-strategy': {
            type: 'string',
            short: 'd',
            default: '',
            allowedValues: getConflictChoicesHelp(FOLDER_CONFLICT_STRATEGIES),
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
            fileStrategyChoices: FILE_CONFLICT_STRATEGIES,
            folderStrategyChoices: FOLDER_CONFLICT_STRATEGIES,
            forcedFileStrategy: fileConflictStrategy,
            forcedFolderStrategy: folderConflictStrategy,
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
            getFileDownloader: (node) => sdk.getFileDownloader(node),
        };

        const downloadQueue = new DownloadQueue(logger, summary, sdk, {
            onDirectory: async (item) => {
                const createdPath = await createLocalFolder(ctx, item);
                if (createdPath) {
                    await downloadQueue.enqueueRemoteFolderChildren(item.remoteNode, createdPath);
                    return true;
                }
                return false;
            },
            startFile: async (item) => {
                return await downloadRemoteFile(ctx, item);
            },
        });

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
}
