import path from 'node:path';

import { TransferSummary } from '../fileSystem/transferSummary';
import { MANIFEST_FILE_NAME } from './const';
import { exportFolderTree } from './exportFolderTree';
import type { TakeoutContext } from './interface';
import { buildManifestSectionBase, type TakeoutManifestSectionBase } from './manifest';
import { type TransferManifest, TransferManifestBuilder } from './transferManifest';
import { writeJsonFile } from './writeManifest';

const MY_FILES_FOLDER = 'my-files';

/** Section of the main manifest describing what `my-files/` holds. */
export type TakeoutManifestSectionMyFiles = TakeoutManifestSectionBase;

/** Manifest written at the root of `my-files/`. */
type TakeoutManifestMyFiles = TransferManifest;

export async function takeoutMyFiles(
    ctx: TakeoutContext,
    summary: TransferSummary,
): Promise<TakeoutManifestSectionMyFiles> {
    const sectionPath = path.join(ctx.takeoutRoot, MY_FILES_FOLDER);
    const transfer = new TransferManifestBuilder();

    try {
        await ctx.createFolder(sectionPath);
        const rootFolder = await ctx.sdk.getMyFilesRootFolder();
        await exportFolderTree(ctx, summary, transfer, {
            node: rootFolder,
            localPath: sectionPath,
            manifestPath: '',
        });

        const manifest: TakeoutManifestMyFiles = transfer.build();
        await writeJsonFile(path.join(sectionPath, MANIFEST_FILE_NAME), manifest);
    } catch (error: unknown) {
        ctx.logger.error(`Takeout of ${MY_FILES_FOLDER} failed`, error);
        summary.recordFailure(MY_FILES_FOLDER, error);
        transfer.addError(error);
    }

    return buildManifestSectionBase(MY_FILES_FOLDER, summary.getCounters(), transfer.hasErrors);
}
