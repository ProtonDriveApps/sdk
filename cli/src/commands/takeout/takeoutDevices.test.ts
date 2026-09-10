import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { Device, DeviceType, MemberRole, NodeEntity, NodeType, ProtonDriveClient } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

jest.mock('node:fs/promises', () => ({
    readdir: jest.fn(),
}));
jest.mock('./exportFolderTree', () => ({
    exportFolderTree: jest.fn(),
}));
jest.mock('./writeManifest', () => ({
    writeJsonFile: jest.fn(),
}));

import { TransferSummary } from '../fileSystem/transferSummary';
import { MANIFEST_FILE_NAME } from './const';
import { exportFolderTree } from './exportFolderTree';
import type { TakeoutContext } from './interface';
import { takeoutDevices } from './takeoutDevices';
import { writeJsonFile } from './writeManifest';

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const mockAuthor = { ok: true as const, value: 'author@example.com' };

function mockDevice(overrides: Partial<Device> = {}): Device {
    return {
        uid: 'device-uid',
        type: DeviceType.MacOS,
        name: { ok: true, value: 'MacBook' },
        rootFolderUid: 'device-root-uid',
        creationTime: new Date('2024-01-01T00:00:00.000Z'),
        shareId: 'share-id',
        ...overrides,
    };
}

function mockRootFolder(uid: string): NodeEntity {
    return {
        uid,
        name: { ok: true, value: 'root' },
        type: NodeType.Folder,
        keyAuthor: mockAuthor,
        nameAuthor: mockAuthor,
        directRole: MemberRole.Admin,
        ownedBy: {},
        isShared: false,
        isSharedByUrl: false,
        creationTime: new Date(),
        modificationTime: new Date(),
        treeEventScopeId: 'scope',
    };
}

async function* iterateDevices(...devices: Device[]): AsyncIterable<Device> {
    for (const device of devices) {
        yield device;
    }
}

function mockContext(options: {
    devices?: Device[];
    getNode?: jest.Mock;
    createFolder?: jest.Mock;
} = {}): TakeoutContext {
    const devices = options.devices ?? [];
    const sdk = {
        iterateDevices: jest.fn(() => iterateDevices(...devices)),
        getNode: options.getNode ?? jest.fn(async (uid: string) => mockRootFolder(uid)),
    } as unknown as ProtonDriveClient;

    return {
        logger: getMockLogger(),
        sdk,
        photosSdk: {} as TakeoutContext['photosSdk'],
        takeoutRoot: '/takeout',
        driveNode: {
            download: {} as TakeoutContext['driveNode']['download'],
            exportRevisions: false,
            iterateRevisions: async function* () {},
        },
        photoNode: {
            download: {} as TakeoutContext['photoNode']['download'],
            exportRevisions: false,
            iterateRevisions: async function* () {},
        },
        createFolder: options.createFolder ?? jest.fn().mockResolvedValue(undefined),
    };
}

describe('takeoutDevices', () => {
    let summary: TransferSummary;

    beforeEach(() => {
        readdirMock.mockResolvedValue([]);
        summary = new TransferSummary('download');
        jest.mocked(exportFolderTree).mockResolvedValue(undefined);
        jest.mocked(writeJsonFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('exports every device into its own folder and writes the section manifest', async () => {
        const laptop = mockDevice({ uid: 'laptop-uid', name: { ok: true, value: 'MacBook' }, rootFolderUid: 'laptop-root' });
        const desktop = mockDevice({
            uid: 'desktop-uid',
            name: { ok: true, value: 'Work PC' },
            rootFolderUid: 'desktop-root',
        });
        const ctx = mockContext({ devices: [laptop, desktop] });

        const section = await takeoutDevices(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/devices');
        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/devices/MacBook');
        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/devices/Work PC');
        expect(exportFolderTree).toHaveBeenCalledTimes(2);
        expect(exportFolderTree).toHaveBeenCalledWith(ctx, summary, expect.any(Object), {
            node: expect.objectContaining({ uid: 'laptop-root' }),
            localPath: '/takeout/devices/MacBook',
            manifestPath: 'MacBook',
        });
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/devices', MANIFEST_FILE_NAME),
            expect.objectContaining({
                items: [
                    { path: 'MacBook', uid: 'laptop-root', originalName: 'MacBook' },
                    { path: 'Work PC', uid: 'desktop-root', originalName: 'Work PC' },
                ],
            }),
        );
        expect(section).toEqual({
            path: './devices',
            deviceCount: 2,
            failures: false,
            transferSummary: {
                downloadedItems: 0,
                downloadedBytes: 0,
                skippedItems: 0,
                failedItems: 0,
            },
        });
    });

    it('continues exporting other devices when one device tree fails', async () => {
        const laptop = mockDevice({ uid: 'laptop-uid', name: { ok: true, value: 'MacBook' }, rootFolderUid: 'laptop-root' });
        const desktop = mockDevice({
            uid: 'desktop-uid',
            name: { ok: true, value: 'Work PC' },
            rootFolderUid: 'desktop-root',
        });
        const ctx = mockContext({ devices: [laptop, desktop] });
        jest.mocked(exportFolderTree)
            .mockRejectedValueOnce(new Error('Tree export failed'))
            .mockResolvedValueOnce(undefined);

        const section = await takeoutDevices(ctx, summary);

        expect(exportFolderTree).toHaveBeenCalledTimes(2);
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/devices', MANIFEST_FILE_NAME),
            expect.objectContaining({
                errors: [{ path: 'MacBook', uid: 'laptop-root', error: 'Error: Tree export failed' }],
            }),
        );
        expect(section.deviceCount).toBe(2);
        expect(section.failures).toBe(true);
        expect(summary.getCounters().failedItems).toBe(1);
    });

    it('uses the device uid when the decrypted name is empty', async () => {
        const device = mockDevice({ uid: 'device-uid', name: { ok: true, value: '' }, rootFolderUid: 'device-root' });
        const ctx = mockContext({ devices: [device] });

        await takeoutDevices(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/devices/device-uid');
        expect(exportFolderTree).toHaveBeenCalledWith(
            ctx,
            summary,
            expect.any(Object),
            expect.objectContaining({ manifestPath: 'device-uid' }),
        );
    });

    it('uses the invalid-name placeholder when the device name cannot be decrypted', async () => {
        const device = mockDevice({
            uid: 'device-uid',
            name: { ok: false, error: { name: 'placeholder-name', error: 'Cannot decrypt' } },
            rootFolderUid: 'device-root',
        });
        const ctx = mockContext({ devices: [device] });

        await takeoutDevices(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/devices/placeholder-name');
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/devices', MANIFEST_FILE_NAME),
            expect.objectContaining({
                items: [
                    {
                        path: 'placeholder-name',
                        uid: 'device-root',
                        originalName: null,
                        error: 'Cannot decrypt',
                    },
                ],
            }),
        );
    });

    it('records a section failure when the devices folder cannot be created', async () => {
        const ctx = mockContext({
            devices: [mockDevice()],
            createFolder: jest.fn().mockRejectedValue(new Error('Permission denied')),
        });

        const section = await takeoutDevices(ctx, summary);

        expect(exportFolderTree).not.toHaveBeenCalled();
        expect(writeJsonFile).not.toHaveBeenCalled();
        expect(section).toEqual({
            path: './devices',
            deviceCount: 0,
            failures: true,
            transferSummary: {
                downloadedItems: 0,
                downloadedBytes: 0,
                skippedItems: 0,
                failedItems: 1,
            },
        });
    });
});
