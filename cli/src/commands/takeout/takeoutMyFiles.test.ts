import path from 'node:path';

import { MemberRole, NodeEntity, NodeType, ProtonDriveClient } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

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
import { takeoutMyFiles } from './takeoutMyFiles';
import { writeJsonFile } from './writeManifest';

const mockAuthor = { ok: true as const, value: 'author@example.com' };

function mockRootFolder(): NodeEntity {
    return {
        uid: 'my-files-root',
        name: { ok: true, value: 'My files' },
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

function mockContext(overrides: Partial<TakeoutContext> = {}): TakeoutContext {
    const sdk = {
        getMyFilesRootFolder: jest.fn().mockResolvedValue(mockRootFolder()),
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
        createFolder: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('takeoutMyFiles', () => {
    let summary: TransferSummary;

    beforeEach(() => {
        summary = new TransferSummary('download');
        jest.mocked(exportFolderTree).mockResolvedValue(undefined);
        jest.mocked(writeJsonFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('exports the my-files root and writes the section manifest', async () => {
        const ctx = mockContext();
        const rootFolder = await ctx.sdk.getMyFilesRootFolder();

        const section = await takeoutMyFiles(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/my-files');
        expect(exportFolderTree).toHaveBeenCalledWith(ctx, summary, expect.any(Object), {
            node: rootFolder,
            localPath: '/takeout/my-files',
            manifestPath: '',
        });
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/my-files', MANIFEST_FILE_NAME),
            { items: [], skippedItems: [], errors: [] },
        );
        expect(section).toEqual({
            path: './my-files',
            failures: false,
            transferSummary: {
                downloadedItems: 0,
                downloadedBytes: 0,
                skippedItems: 0,
                failedItems: 0,
            },
        });
    });

    it('records a section failure when the root folder is unavailable', async () => {
        const error = new Error('Root folder unavailable');
        const ctx = mockContext({
            sdk: {
                getMyFilesRootFolder: jest.fn().mockRejectedValue(error),
            } as unknown as ProtonDriveClient,
        });

        const section = await takeoutMyFiles(ctx, summary);

        expect(exportFolderTree).not.toHaveBeenCalled();
        expect(writeJsonFile).not.toHaveBeenCalled();
        expect(section).toEqual({
            path: './my-files',
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
