import path from 'node:path';

import { Device } from '@protontech/drive-sdk';

import { TransferSummary } from '../fileSystem/transferSummary';
import { MANIFEST_FILE_NAME } from './const';
import { exportFolderTree } from './exportFolderTree';
import type { TakeoutContext } from './interface';
import { buildManifestSectionBase, type TakeoutManifestSectionBase } from './manifest';
import { NameRegistry } from './nameRegistry';
import { serializeName, type TransferManifest, TransferManifestBuilder } from './transferManifest';
import { writeJsonFile } from './writeManifest';

const DEVICES_FOLDER = 'devices';

/** Section of the main manifest describing what `devices/` holds. */
export type TakeoutManifestSectionDevices = TakeoutManifestSectionBase & {
    deviceCount: number;
};

/** Manifest written at the root of `devices/`. */
type TakeoutManifestDevices = TransferManifest;

/**
 * Mirrors the root folder of every computer of the user into
 * `devices/<device>/`. A device whose tree fails is recorded and the remaining
 * devices are still exported.
 */
export async function takeoutDevices(
    ctx: TakeoutContext,
    summary: TransferSummary,
): Promise<TakeoutManifestSectionDevices> {
    const sectionPath = path.join(ctx.takeoutRoot, DEVICES_FOLDER);
    const transfer = new TransferManifestBuilder();
    let deviceCount = 0;

    try {
        await ctx.createFolder(sectionPath);
        const registry = await NameRegistry.createForFolder(sectionPath);

        for await (const device of ctx.sdk.iterateDevices()) {
            deviceCount++;
            const folderName = registry.allocate(getDeviceName(device));
            const devicePath = path.join(sectionPath, folderName);

            try {
                await ctx.createFolder(devicePath);
                transfer.addItem({
                    path: folderName,
                    uid: device.rootFolderUid,
                    ...serializeName(device.name),
                });

                const rootFolder = await ctx.sdk.getNode(device.rootFolderUid);
                await exportFolderTree(ctx, summary, transfer, {
                    node: rootFolder,
                    localPath: devicePath,
                    manifestPath: folderName,
                });
            } catch (error: unknown) {
                summary.recordFailure(folderName, error, device.rootFolderUid);
                transfer.addError(error, { path: folderName, uid: device.rootFolderUid });
            }
        }

        const manifest: TakeoutManifestDevices = transfer.build();
        await writeJsonFile(path.join(sectionPath, MANIFEST_FILE_NAME), manifest);
    } catch (error: unknown) {
        ctx.logger.error(`Takeout of ${DEVICES_FOLDER} failed`, error);
        summary.recordFailure(DEVICES_FOLDER, error);
        transfer.addError(error);
    }

    return {
        ...buildManifestSectionBase(DEVICES_FOLDER, summary.getCounters(), transfer.hasErrors),
        deviceCount,
    };
}

function getDeviceName(device: Device): string {
    if (device.name.ok) {
        return device.name.value.length > 0 ? device.name.value : device.uid;
    }
    return device.name.error instanceof Error ? device.uid : device.name.error.name;
}
