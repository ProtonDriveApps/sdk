import { TransferCounters } from '../fileSystem/transferSummary';
import type { TakeoutManifestSectionDevices } from './takeoutDevices';
import type { TakeoutManifestSectionMyFiles } from './takeoutMyFiles';
import type { TakeoutManifestSectionPhotos } from './takeoutPhotos';

export const TAKEOUT_MANIFEST_VERSION = 1;

/**
 * Manifest of the whole run, written at the takeout root once every section
 * has finished, so it always describes a completed run. It carries counters
 * only; error details are listed in dedicated manifests.
 */
export type TakeoutManifest = {
    version: typeof TAKEOUT_MANIFEST_VERSION;
    startedAt: string;
    finishedAt: string;
    cliVersion: string;
    sdkVersion?: string;
    included: string[];
    sections: TakeoutManifestSections;
};

export type TakeoutManifestSections = {
    'my-files'?: TakeoutManifestSectionMyFiles;
    devices?: TakeoutManifestSectionDevices;
    photos?: TakeoutManifestSectionPhotos;
};

/**
 * Generic part of every section in the main manifest file.
 */
export type TakeoutManifestSectionBase = {
    /** Path relative to the takeout root, always with POSIX separators. */
    path: string;
    failures: boolean;
    transferSummary: {
        downloadedItems: number;
        downloadedBytes: number;
        skippedItems: number;
        failedItems: number;
    };
};

export function buildManifestSectionBase(
    sectionFolder: string,
    counters: TransferCounters,
    failures: boolean,
): TakeoutManifestSectionBase {
    return {
        path: `./${sectionFolder}`,
        failures,
        transferSummary: {
            downloadedItems: counters.transferredItems,
            downloadedBytes: counters.transferredBytes,
            skippedItems: counters.skippedItems,
            failedItems: counters.failedItems,
        },
    };
}
