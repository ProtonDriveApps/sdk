import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { MemberRole, NodeEntity, NodeType, ProtonDriveClient } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

jest.mock('node:fs/promises', () => ({
    readdir: jest.fn(),
}));
jest.mock('../fileSystem/downloadOperations', () => ({
    createLocalFolder: jest.fn(),
}));
jest.mock('./exportNode', () => ({
    exportNode: jest.fn(),
}));
jest.mock('./writeManifest', () => ({
    writeJsonFile: jest.fn(),
}));
jest.mock('../../cli', () => jest.requireActual('../../cli/node'));

import { createLocalFolder } from '../fileSystem/downloadOperations';
import { TransferSummary } from '../fileSystem/transferSummary';
import { ALREADY_EXISTS_MESSAGE } from './const';
import { exportFolderTree } from './exportFolderTree';
import { exportNode } from './exportNode';
import type { TakeoutContext } from './interface';
import { TransferManifestBuilder } from './transferManifest';

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const mockAuthor = { ok: true as const, value: 'author@example.com' };

function mockFolder(name: string, uid: string, overrides: Partial<NodeEntity> = {}): NodeEntity {
    return {
        uid,
        name: { ok: true, value: name },
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
        ...overrides,
    };
}

function mockFile(name: string, uid: string, overrides: Partial<NodeEntity> = {}): NodeEntity {
    return {
        uid,
        name: { ok: true, value: name },
        type: NodeType.File,
        keyAuthor: mockAuthor,
        nameAuthor: mockAuthor,
        directRole: MemberRole.Admin,
        ownedBy: {},
        isShared: false,
        isSharedByUrl: false,
        creationTime: new Date(),
        modificationTime: new Date(),
        treeEventScopeId: 'scope',
        ...overrides,
    };
}

async function* iterateChildren(...nodes: NodeEntity[]): AsyncIterable<NodeEntity> {
    for (const node of nodes) {
        yield node;
    }
}

function mockSdk(childrenByFolderUid: Record<string, NodeEntity[]>): ProtonDriveClient {
    return {
        iterateFolderChildren: jest.fn(async function* (folder: NodeEntity) {
            for (const child of childrenByFolderUid[folder.uid] ?? []) {
                yield child;
            }
        }),
    } as unknown as ProtonDriveClient;
}

function mockContext(sdk: ProtonDriveClient): TakeoutContext {
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
        createFolder: jest.fn(),
    };
}

describe('exportFolderTree', () => {
    const root = mockFolder('root', 'root-uid');
    const sectionPath = '/takeout/my-files';
    let summary: TransferSummary;
    let manifest: TransferManifestBuilder;

    beforeEach(() => {
        readdirMock.mockResolvedValue([]);
        summary = new TransferSummary('download');
        manifest = new TransferManifestBuilder();
        jest.mocked(createLocalFolder).mockResolvedValue('/created/path');
        jest.mocked(exportNode).mockResolvedValue({ kind: 'file', bytes: 1024 });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('records exported folders and files in the manifest', async () => {
        const nestedFolder = mockFolder('docs', 'docs-uid');
        const notes = mockFile('notes.txt', 'notes-uid');
        const sdk = mockSdk({
            'root-uid': [nestedFolder, notes],
            'docs-uid': [],
        });
        jest.mocked(createLocalFolder).mockImplementation(async (_ctx, item) => {
            if (item.kind === 'directory') {
                return path.join(sectionPath, item.baseName);
            }
            return undefined;
        });

        await exportFolderTree(mockContext(sdk), summary, manifest, {
            node: root,
            localPath: sectionPath,
            manifestPath: '',
        });

        expect(manifest.build()).toEqual({
            items: [
                { path: 'docs', uid: 'docs-uid', originalName: 'docs' },
                { path: 'notes.txt', uid: 'notes-uid', originalName: 'notes.txt' },
            ],
            skippedItems: [],
            errors: [],
        });
        expect(summary.getCounters()).toEqual({
            transferredItems: 2,
            transferredBytes: 1024,
            skippedItems: 0,
            failedItems: 0,
        });
    });

    it('records a skipped directory when it already exists locally', async () => {
        const nestedFolder = mockFolder('docs', 'docs-uid');
        const sdk = mockSdk({ 'root-uid': [nestedFolder] });
        jest.mocked(createLocalFolder).mockResolvedValue(undefined);

        await exportFolderTree(mockContext(sdk), summary, manifest, {
            node: root,
            localPath: sectionPath,
            manifestPath: '',
        });

        expect(manifest.build()).toEqual({
            items: [],
            skippedItems: [
                {
                    path: 'docs',
                    uid: 'docs-uid',
                    originalName: 'docs',
                    reason: ALREADY_EXISTS_MESSAGE,
                },
            ],
            errors: [],
        });
        expect(summary.getCounters().skippedItems).toBe(1);
    });

    it('records a skipped file when exportNode skips it', async () => {
        const notes = mockFile('notes.txt', 'notes-uid');
        const sdk = mockSdk({ 'root-uid': [notes] });
        jest.mocked(exportNode).mockResolvedValue({ kind: 'skipped', reason: 'Unsupported file type' });

        await exportFolderTree(mockContext(sdk), summary, manifest, {
            node: root,
            localPath: sectionPath,
            manifestPath: '',
        });

        expect(manifest.build()).toEqual({
            items: [],
            skippedItems: [
                {
                    path: 'notes.txt',
                    uid: 'notes-uid',
                    originalName: 'notes.txt',
                    reason: 'Unsupported file type',
                },
            ],
            errors: [],
        });
    });

    it('records revision errors while still exporting the file', async () => {
        const notes = mockFile('notes.txt', 'notes-uid');
        const sdk = mockSdk({ 'root-uid': [notes] });
        const revisionError = new Error('Decryption failed');
        jest.mocked(exportNode).mockResolvedValue({
            kind: 'revisions',
            bytes: 512,
            errors: [revisionError],
        });

        await exportFolderTree(mockContext(sdk), summary, manifest, {
            node: root,
            localPath: sectionPath,
            manifestPath: '',
        });

        const built = manifest.build();
        expect(built.items).toEqual([{ path: 'notes.txt', uid: 'notes-uid', originalName: 'notes.txt' }]);
        expect(built.errors).toEqual([
            { path: 'notes.txt', uid: 'notes-uid', error: 'Error: Decryption failed' },
        ]);
        expect(summary.getCounters()).toEqual({
            transferredItems: 1,
            transferredBytes: 512,
            skippedItems: 0,
            failedItems: 1,
        });
    });

    it('records directory creation failures in the manifest and summary', async () => {
        const nestedFolder = mockFolder('docs', 'docs-uid');
        const sdk = mockSdk({ 'root-uid': [nestedFolder] });
        jest.mocked(createLocalFolder).mockRejectedValue(new Error('Permission denied'));

        await exportFolderTree(mockContext(sdk), summary, manifest, {
            node: root,
            localPath: sectionPath,
            manifestPath: '',
        });

        expect(manifest.build().errors).toEqual([
            { path: 'docs', uid: 'docs-uid', error: 'Error: Permission denied' },
        ]);
        expect(summary.getCounters().failedItems).toBe(1);
    });

    it('builds nested manifest paths with POSIX separators', async () => {
        const nestedFolder = mockFolder('docs', 'docs-uid');
        const notes = mockFile('notes.txt', 'notes-uid');
        const sdk = mockSdk({
            'root-uid': [nestedFolder],
            'docs-uid': [notes],
        });
        jest.mocked(createLocalFolder).mockImplementation(async (_ctx, item) => {
            if (item.kind === 'directory') {
                return path.join(sectionPath, item.baseName);
            }
            return undefined;
        });

        await exportFolderTree(mockContext(sdk), summary, manifest, {
            node: root,
            localPath: sectionPath,
            manifestPath: 'device-a',
        });

        expect(manifest.build().items).toEqual([
            { path: 'device-a/docs', uid: 'docs-uid', originalName: 'docs' },
            { path: 'device-a/docs/notes.txt', uid: 'notes-uid', originalName: 'notes.txt' },
        ]);
    });

    it('rejects unsupported node types', async () => {
        const unsupported = mockFile('broken', 'broken-uid');
        unsupported.type = 99 as unknown as NodeType;
        const sdk = mockSdk({ 'root-uid': [unsupported] });

        await expect(
            exportFolderTree(mockContext(sdk), summary, manifest, {
                node: root,
                localPath: sectionPath,
                manifestPath: '',
            }),
        ).rejects.toThrow(Error);
    });
});
