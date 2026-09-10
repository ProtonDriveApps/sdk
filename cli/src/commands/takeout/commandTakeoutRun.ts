import { Logger, ProtonDriveClient, Revision, ValidationError } from '@protontech/drive-sdk';
import { makeNodeUidFromRevisionUid } from '@protontech/drive-sdk/internal/uids';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, type Options, printObject } from '../../cli';
import type { CliMetrics } from '../../telemetry';
import { type DownloadContext, ensureDirectory } from '../fileSystem/downloadOperations';
import { assertDownloadDestination, assertValidDownloadRoot } from '../fileSystem/downloadPathValidation';
import { resolveLocalPaths } from '../fileSystem/localPath';
import { ConflictChoice, TransferConflictResolver } from '../fileSystem/transferConflictResolver';
import { createTransferProgress, type TransferProgressInterface } from '../fileSystem/transferProgress';
import { TransferSummary } from '../fileSystem/transferSummary';
import type { TakeoutContext } from './interface';
import { TAKEOUT_MANIFEST_VERSION, type TakeoutManifest, type TakeoutManifestSections } from './manifest';
import { takeoutDevices } from './takeoutDevices';
import { takeoutMyFiles } from './takeoutMyFiles';
import { takeoutPhotos } from './takeoutPhotos';
import { writeManifest } from './writeManifest';

/*
Output layout:

<localFolder>/
├── manifest.json                   # run manifest
├── my-files/                       # mirror of /my-files
│   ├── manifest.json               # section index
│   └── docs/
│       ├── notes.txt
│       ├── notes.txt.manifest.json # manifest of that one file
│       └── report.pdf/             # only with `revisions`, see below
│          ├── manifest.json        # manifest of the report.pdf file
│          ├── 2026-01-01T10-30-00Z_revisionId.txt
│          └── ...                  # other revisions
├── devices/
│   ├── manifest.json
│   └── MacBook/                    # one folder per device, mirror of its root
│       └── ...
└── photos/                         # every photo, in the timeline and in albums
    ├── manifest.json               # section index of both timeline and albums
    ├── timeline/
    │   └── 2026/07/                # grouped by capture year and month
    │       ├── IMG_0042.HEIC
    │       └── IMG_0042.HEIC.manifest.json
    └── albums/
        └── Vacation 2026/
            └── manifest.json       # links into ../../timeline, plus local files
*/

export const TAKEOUT_SECTIONS = ['my-files', 'devices', 'photos', 'revisions'] as const;

export type TakeoutSection = (typeof TAKEOUT_SECTIONS)[number];

const SECTION_HELP: Record<TakeoutSection, string> = {
    'my-files': 'Your files and folders.',
    devices: 'Files and folders of each of your computers.',
    revisions: 'Include all older versions of files (by default, only latest ones are exported).',
    photos: 'Your photo timeline and albums.',
};

export class CommandTakeoutRun implements Command {
    group = 'takeout';
    name = 'run';
    help =
        'Exports an offline copy of your account into a local folder, together with a manifest describing what was exported. It never changes anything in your account. Nothing is exported unless you select at least one section with --include. Proton Docs or Sheets are not supported yet.';
    args = ['localFolder'];
    options: Options = {
        include: {
            type: 'string',
            short: 'i',
            multiple: true,
            default: [],
            allowedValues: TAKEOUT_SECTIONS.map((section) => ({ value: section, help: SECTION_HELP[section] })),
            help: 'What to include in the takeout, multiple options allowed.',
        },
    };

    async action({ config, logger, sdk, photosSdk, metrics, args, options: { json, include } }: ActionArgs) {
        const sections = parseSections(include);
        const takeoutRoot = await resolveTakeoutRoot(args[0]!);

        const startedAt = new Date();
        const summaries: TransferSummary[] = [];
        let currentSummary: TransferSummary | undefined;
        const progress = json ? undefined : createTransferProgress(() => currentSummary?.formatProgressLine() ?? '');

        const context = createTakeoutContext(
            { logger, sdk, photosSdk, metrics },
            { takeoutRoot, exportRevisions: sections.has('revisions'), progress },
        );
        const runSection = async <SectionType>(
            takeout: (ctx: TakeoutContext, summary: TransferSummary) => Promise<SectionType>,
        ): Promise<SectionType> => {
            const summary = new TransferSummary('download');
            summaries.push(summary);
            currentSummary = summary;
            return await takeout(context, summary);
        };

        const manifestSections: TakeoutManifestSections = {};
        try {
            if (sections.has('my-files')) {
                manifestSections['my-files'] = await runSection(takeoutMyFiles);
            }
            if (sections.has('devices')) {
                manifestSections.devices = await runSection(takeoutDevices);
            }
            if (sections.has('photos')) {
                manifestSections.photos = await runSection(takeoutPhotos);
            }
        } finally {
            progress?.dispose();
        }

        const manifest: TakeoutManifest = {
            version: TAKEOUT_MANIFEST_VERSION,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            cliVersion: config.appVersion,
            sdkVersion: config.sdkVersion,
            included: TAKEOUT_SECTIONS.filter((section) => sections.has(section)),
            sections: manifestSections,
        };
        await writeManifest(takeoutRoot, manifest);
        printObject(manifest, json);

        const failureCount = summaries.reduce((total, summary) => total + summary.failureCount, 0);
        if (failureCount > 0) {
            throw new ValidationError(`${failureCount} item(s) failed to export`);
        }
    }
}

export function parseSections(include: string[]): Set<TakeoutSection> {
    if (include.length === 0) {
        throw new ValidationError(`Select what to export with --include. Available sections: ${listSections()}`);
    }

    const sections = new Set<TakeoutSection>();
    for (const name of include) {
        const section = TAKEOUT_SECTIONS.find((candidate) => candidate === name);
        if (!section) {
            throw new ValidationError(`Unknown section "${name}". Available sections: ${listSections()}`);
        }
        sections.add(section);
    }

    // Revisions is a modifier of downloaded files, not a standalone section.
    if (sections.has('revisions') && !sections.has('my-files') && !sections.has('devices')) {
        throw new ValidationError('Section "revisions" also requires "my-files" or "devices"');
    }

    return sections;
}

function listSections(): string {
    return TAKEOUT_SECTIONS.join(', ');
}

async function resolveTakeoutRoot(localFolder: string): Promise<string> {
    const resolvedLocalPaths = await resolveLocalPaths(localFolder);
    if (resolvedLocalPaths.length !== 1) {
        throw new ValidationError('Expected exactly one local path');
    }
    const takeoutRoot = assertValidDownloadRoot(resolvedLocalPaths[0]);
    await ensureDirectory(takeoutRoot);
    return takeoutRoot;
}

function createTakeoutContext(
    dependencies: {
        logger: Logger;
        sdk: ProtonDriveClient;
        photosSdk: ProtonDrivePhotosClient;
        metrics?: CliMetrics;
    },
    options: { takeoutRoot: string; exportRevisions: boolean; progress?: TransferProgressInterface },
): TakeoutContext {
    // Takeout writes into a folder it owns and must never block on a prompt.
    // With NameRegistry allocating names up front, these strategies only apply
    // to names taken by something outside the run.
    const conflictResolver = new TransferConflictResolver(dependencies.logger, {
        fileStrategyChoices: [ConflictChoice.Rename],
        folderStrategyChoices: [ConflictChoice.Merge],
        forcedFileStrategy: ConflictChoice.Rename,
        forcedFolderStrategy: ConflictChoice.Merge,
        disableInteractiveResolution: true,
    });
    const createDownloadContext = (
        getFileRevisionDownloader: DownloadContext['getFileRevisionDownloader'],
    ): DownloadContext => ({
        logger: dependencies.logger,
        progress: options.progress,
        conflictResolver,
        downloadRoot: options.takeoutRoot,
        metrics: dependencies.metrics,
        getFileRevisionDownloader,
    });

    return {
        logger: dependencies.logger,
        sdk: dependencies.sdk,
        photosSdk: dependencies.photosSdk,
        takeoutRoot: options.takeoutRoot,
        driveNode: {
            download: createDownloadContext((revisionUid) => dependencies.sdk.getFileRevisionDownloader(revisionUid)),
            exportRevisions: options.exportRevisions,
            iterateRevisions: (node) => dependencies.sdk.iterateRevisions(node),
        },
        photoNode: {
            download: createDownloadContext((revisionUid) => {
                const nodeUid = makeNodeUidFromRevisionUid(revisionUid);
                return dependencies.photosSdk.getFileDownloader(nodeUid);
            }),
            // Photos does not support revisions.
            exportRevisions: false,
            iterateRevisions: async function* (): AsyncGenerator<Revision> {},
        },
        createFolder: async (absolutePath) => {
            assertDownloadDestination(options.takeoutRoot, absolutePath);
            await ensureDirectory(absolutePath);
        },
    };
}
