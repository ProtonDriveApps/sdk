import { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import { MemberRole, NodeEntity, NodeType, ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

import { DownloadQueue, MAX_CONCURRENT_ITEMS, QueueItem, UploadQueue } from './transferQueue';
import { TransferSummary } from './transferSummary';

jest.mock('../../cli', () => jest.requireActual('../../cli/node'));

jest.mock('node:fs/promises', () => ({
    readdir: jest.fn(),
    lstat: jest.fn(),
}));

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const lstatMock = lstat as jest.MockedFunction<typeof lstat>;

function testSummary(): TransferSummary {
    return new TransferSummary('upload');
}

function summaryAsJson(summary: TransferSummary) {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    summary.print({ json: true });
    const result = JSON.parse(logSpy.mock.calls[0]![0] as string);
    logSpy.mockRestore();
    return result;
}

type ReaddirDirents = Awaited<ReturnType<typeof readdir>>;

function mockFileLstatResult(dev = 100): Awaited<ReturnType<typeof lstat>> {
    return {
        dev,
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        isSocket: () => false,
        isFIFO: () => false,
        isCharacterDevice: () => false,
        isBlockDevice: () => false,
    } as Awaited<ReturnType<typeof lstat>>;
}

function mockDirLstatResult(dev = 100): Awaited<ReturnType<typeof lstat>> {
    return {
        dev,
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
        isSocket: () => false,
        isFIFO: () => false,
        isCharacterDevice: () => false,
        isBlockDevice: () => false,
    } as Awaited<ReturnType<typeof lstat>>;
}

const mockAuthor = { ok: true as const, value: 'a@b.c' };

function mockFolderMaybe(name: string, uid: string): NodeEntity {
    return {
        uid,
        name: { ok: true, value: name },
        type: NodeType.Folder,
        keyAuthor: mockAuthor,
        nameAuthor: mockAuthor,
        directRole: MemberRole.Admin,
        ownedBy: {},
        isShared: false,
        isSharedPublicly: false,
        creationTime: new Date(),
        modificationTime: new Date(),
        treeEventScopeId: 'scope',
    };
}

function mockFileMaybe(name: string, uid: string): NodeEntity {
    return {
        uid,
        name: { ok: true, value: name },
        type: NodeType.File,
        keyAuthor: mockAuthor,
        nameAuthor: mockAuthor,
        directRole: MemberRole.Admin,
        ownedBy: {},
        isShared: false,
        isSharedPublicly: false,
        creationTime: new Date(),
        modificationTime: new Date(),
        treeEventScopeId: 'scope',
    };
}

class SeededUploadQueue extends UploadQueue {
    seed(items: QueueItem<{ parentNode: NodeEntity }>[]) {
        for (const item of items) {
            this.enqueueItem(item);
        }
    }
}

describe('TransferQueue (via UploadQueue.processQueue)', () => {
    const parent = mockFolderMaybe('parent', 'p1');

    it('resolves immediately for an empty queue', async () => {
        const onDirectory = jest.fn(async () => true);
        const startFile = jest.fn(async () => 0);
        const q = new UploadQueue(getMockLogger(), testSummary(), { onDirectory, startFile });
        await q.processQueue();
        expect(onDirectory).not.toHaveBeenCalled();
        expect(startFile).not.toHaveBeenCalled();
    });

    it('awaits onDirectory before processing later items', async () => {
        const order: string[] = [];
        const onDirectory = jest.fn(async () => {
            order.push('dir-start');
            await new Promise((r) => setImmediate(r));
            order.push('dir-end');
            return true;
        });
        const startFile = jest.fn(async () => {
            order.push('file');
            return 0;
        });
        const q = new SeededUploadQueue(getMockLogger(), testSummary(), { onDirectory, startFile });
        q.seed([
            { kind: 'directory', localPath: '/a', baseName: 'a', parentNode: parent },
            { kind: 'file', localPath: '/f', baseName: 'f', parentNode: parent },
        ]);
        await q.processQueue();
        expect(order).toEqual(['dir-start', 'dir-end', 'file']);
        expect(onDirectory).toHaveBeenCalledTimes(1);
        expect(startFile).toHaveBeenCalledTimes(1);
    });

    it('limits the number of concurrent file transfers', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const onDirectory = jest.fn(async () => true);
        const startFile = jest.fn(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setImmediate(r));
            inFlight--;
            return 0;
        });
        const q = new SeededUploadQueue(getMockLogger(), testSummary(), { onDirectory, startFile });
        const items: QueueItem<{ parentNode: NodeEntity }>[] = [];
        for (let i = 0; i < 12; i++) {
            items.push({
                kind: 'file',
                localPath: `/f${i}`,
                baseName: `f${i}`,
                parentNode: parent,
            });
        }
        q.seed(items);
        await q.processQueue();
        expect(maxInFlight).toBe(MAX_CONCURRENT_ITEMS);
        expect(startFile).toHaveBeenCalledTimes(12);
    });

    it('continues processing after a file transfer fails when summary is set', async () => {
        const summary = new TransferSummary('upload');
        const onDirectory = jest.fn(async () => true);
        const startFile = jest.fn(async (item: QueueItem<{ parentNode: NodeEntity }>) => {
            if (item.baseName === 'bad') {
                throw new Error('upload failed');
            }
            return 100;
        });
        const q = new SeededUploadQueue(getMockLogger(), summary, { onDirectory, startFile });
        q.seed([
            { kind: 'file', localPath: '/bad', baseName: 'bad', parentNode: parent },
            { kind: 'file', localPath: '/good', baseName: 'good', parentNode: parent },
        ]);
        await q.processQueue();
        expect(startFile).toHaveBeenCalledTimes(2);
        expect(summary.failureCount).toBe(1);
        expect(summary.formatProgressLine()).toBe('Uploaded 1 | Failed 1 | Queued 0');
        expect(summaryAsJson(summary)).toMatchObject({
            transferredItems: 1,
            transferredBytes: 100,
            failedItems: 1,
            failures: [{ name: 'bad', error: 'Error: upload failed' }],
        });
    });

    it('continues processing after a directory handler fails when summary is set', async () => {
        const summary = new TransferSummary('upload');
        const onDirectory = jest.fn(async () => {
            throw new Error('folder failed');
        });
        const startFile = jest.fn(async () => 0);
        const q = new SeededUploadQueue(getMockLogger(), summary, { onDirectory, startFile });
        q.seed([
            { kind: 'directory', localPath: '/dir', baseName: 'dir', parentNode: parent },
            { kind: 'file', localPath: '/f', baseName: 'f', parentNode: parent },
        ]);
        await q.processQueue();
        expect(onDirectory).toHaveBeenCalledTimes(1);
        expect(startFile).toHaveBeenCalledTimes(1);
        expect(summary.failureCount).toBe(1);
        expect(summaryAsJson(summary).failures[0]).toMatchObject({
            name: 'dir',
            error: 'Error: folder failed',
        });
    });

    it('records skipped items without counting them as successes', async () => {
        const summary = new TransferSummary('upload');
        const onDirectory = jest.fn(async (): Promise<boolean> => false);
        const startFile = jest.fn(async (): Promise<number | false> => false);
        const q = new SeededUploadQueue(getMockLogger(), summary, { onDirectory, startFile });
        q.seed([
            { kind: 'directory', localPath: '/dir', baseName: 'dir', parentNode: parent },
            { kind: 'file', localPath: '/f', baseName: 'f', parentNode: parent },
        ]);
        await q.processQueue();
        expect(summary.failureCount).toBe(0);
        expect(summary.formatProgressLine()).toBe('Uploaded 0 | Skipped 2 | Queued 0');
        expect(summaryAsJson(summary)).toMatchObject({
            transferredItems: 0,
            transferredBytes: 0,
            failedItems: 0,
            skippedItems: 2,
        });
    });

    it('waits for all in-flight file transfers before finishing', async () => {
        const pending: Array<() => void> = [];
        const onDirectory = jest.fn(async () => true);
        const startFile = jest.fn(
            () =>
                new Promise<number>((resolve) => {
                    pending.push(() => resolve(0));
                }),
        );
        const q = new SeededUploadQueue(getMockLogger(), testSummary(), { onDirectory, startFile });
        q.seed([{ kind: 'file', localPath: '/one', baseName: 'one', parentNode: parent }]);
        const done = q.processQueue();
        await new Promise((r) => setImmediate(r));
        expect(pending.length).toBe(1);
        pending[0]!();
        await done;
        expect(startFile).toHaveBeenCalledTimes(1);
    });
});

describe('UploadQueue', () => {
    const parent = mockFolderMaybe('parent', 'p1');

    beforeEach(() => {
        readdirMock.mockReset();
        lstatMock.mockReset();
    });

    it('enqueueLocalPaths enqueues a file', async () => {
        lstatMock.mockResolvedValueOnce(mockFileLstatResult());
        const q = new SeededUploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await q.enqueueLocalPaths(['/tmp/x.txt'], parent);
        expect(q['queue']).toHaveLength(1);
        expect(q['queue'][0]).toMatchObject({
            kind: 'file',
            baseName: 'x.txt',
            parentNode: parent,
        });
        expect(path.isAbsolute((q['queue'][0] as { localPath: string }).localPath)).toBe(true);
    });

    it('enqueueLocalPaths enqueues a directory', async () => {
        lstatMock.mockResolvedValueOnce(mockDirLstatResult());
        const q = new SeededUploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await q.enqueueLocalPaths(['/tmp/mydir'], parent);
        expect(q['queue'][0]).toMatchObject({
            kind: 'directory',
            baseName: 'mydir',
            parentNode: parent,
        });
    });

    it('throws ValidationError for character devices', async () => {
        const charDev = {
            dev: 1,
            isDirectory: () => false,
            isFile: () => false,
            isSymbolicLink: () => false,
            isSocket: () => false,
            isFIFO: () => false,
            isCharacterDevice: () => true,
            isBlockDevice: () => false,
        } as Awaited<ReturnType<typeof lstat>>;
        lstatMock.mockResolvedValue(charDev);
        const q = new UploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await expect(q.enqueueLocalPaths(['/dev/null'], parent)).rejects.toThrow(ValidationError);
        await expect(q.enqueueLocalPaths(['/dev/null'], parent)).rejects.toThrow(
            'Not a regular file or directory: /dev/null',
        );
    });

    it('throws ValidationError for symbolic links', async () => {
        lstatMock.mockResolvedValueOnce({
            dev: 1,
            isDirectory: () => false,
            isFile: () => false,
            isSymbolicLink: () => true,
            isSocket: () => false,
            isFIFO: () => false,
            isCharacterDevice: () => false,
            isBlockDevice: () => false,
        } as Awaited<ReturnType<typeof lstat>>);
        const q = new UploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await expect(q.enqueueLocalPaths(['/tmp/alink'], parent)).rejects.toThrow(
            'Not a regular file or directory: /tmp/alink',
        );
    });

    it('throws ValidationError when path is an unsupported type', async () => {
        lstatMock.mockResolvedValueOnce({
            dev: 1,
            isDirectory: () => false,
            isFile: () => false,
            isSymbolicLink: () => false,
            isSocket: () => false,
            isFIFO: () => false,
            isCharacterDevice: () => false,
            isBlockDevice: () => false,
        } as Awaited<ReturnType<typeof lstat>>);
        const q = new UploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await expect(q.enqueueLocalPaths(['/weird'], parent)).rejects.toThrow('Not a regular file or directory');
    });

    it('enqueueLocalDirectoryChildren enqueues each child and skips . and ..', async () => {
        const dot = { name: '.', isDirectory: () => true, isFile: () => false } as Dirent;
        const dotdot = { name: '..', isDirectory: () => true, isFile: () => false } as Dirent;
        const child = { name: 'kid', isDirectory: () => false, isFile: () => true } as Dirent;
        const resolvedParent = path.resolve('/parent');
        lstatMock.mockResolvedValueOnce(mockDirLstatResult(42));
        readdirMock.mockResolvedValueOnce([dot, dotdot, child] as unknown as ReaddirDirents);
        lstatMock.mockResolvedValueOnce(mockFileLstatResult(42));
        const q = new SeededUploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await q.enqueueLocalDirectoryChildren('/parent', parent);
        expect(readdirMock).toHaveBeenCalledWith(resolvedParent, { withFileTypes: true });
        expect(q['queue']).toHaveLength(1);
        expect(q['queue'][0]).toMatchObject({ kind: 'file', baseName: 'kid' });
    });

    it('enqueueLocalDirectoryChildren rejects children on another device (mount point)', async () => {
        const kid = { name: 'mounted', isDirectory: () => true, isFile: () => false } as Dirent;
        lstatMock.mockResolvedValueOnce(mockDirLstatResult(1));
        readdirMock.mockResolvedValueOnce([kid] as unknown as ReaddirDirents);
        lstatMock.mockResolvedValueOnce(mockDirLstatResult(2));
        const q = new UploadQueue(getMockLogger(), testSummary(), {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
        await expect(q.enqueueLocalDirectoryChildren('/parent', parent)).rejects.toThrow(
            'Cannot traverse into a different file system (mount point)',
        );
    });
});

describe('DownloadQueue', () => {
    const folder = mockFolderMaybe('remoteDir', 'rf');
    const file = mockFileMaybe('remote.txt', 'rfile');

    function createQueue(sdk: Pick<ProtonDriveClient, 'iterateFolderChildren'>) {
        return new DownloadQueue(getMockLogger(), testSummary(), sdk as ProtonDriveClient, {
            onDirectory: jest.fn(async () => true),
            startFile: jest.fn(async () => 0),
        });
    }

    it('enqueueRemotePaths resolves nodes and enqueues folder and file items', async () => {
        const sdk = { iterateFolderChildren: jest.fn() };
        const q = createQueue(sdk);
        await q.enqueueRemotePaths(['/remoteDir', '/remote.txt'], '/local/out', async (s) => {
            if (s === '/remoteDir') {
                return folder;
            }
            return file;
        });
        expect(q['queue']).toHaveLength(2);
        expect(q['queue']).toEqual([
            {
                kind: 'directory',
                remoteNode: folder,
                baseName: 'remoteDir',
                localPath: path.join(path.resolve('/local/out'), 'remoteDir'),
            },
            {
                kind: 'file',
                remoteNode: file,
                baseName: 'remote.txt',
                localPath: path.join(path.resolve('/local/out'), 'remote.txt'),
            },
        ]);
        const dirPath = (q['queue'][0] as { localPath: string }).localPath;
        expect(dirPath).toBe(path.join(path.resolve('/local/out'), 'remoteDir'));
    });

    it('enqueueRemotePaths sanitizes names that are not valid as local path segments', async () => {
        const invalidNameFile = mockFileMaybe('bad/name.txt', 'uid');
        const sdk = { iterateFolderChildren: jest.fn() };
        const q = createQueue(sdk);
        await q.enqueueRemotePaths(['/x'], '/local/out', async () => invalidNameFile);
        expect(q['queue']).toEqual([
            {
                kind: 'file',
                remoteNode: invalidNameFile,
                baseName: 'bad_name.txt',
                localPath: path.join(path.resolve('/local/out'), 'bad_name.txt'),
            },
        ]);
    });

    it('enqueueRemoteNode rejects unsupported node types', async () => {
        const albumNode: NodeEntity = {
            uid: 'al',
            name: { ok: true, value: 'album' },
            type: NodeType.Album,
            keyAuthor: mockAuthor,
            nameAuthor: mockAuthor,
            directRole: MemberRole.Admin,
            ownedBy: {},
            isShared: false,
            isSharedPublicly: false,
            creationTime: new Date(),
            modificationTime: new Date(),
            treeEventScopeId: 'scope',
        };
        const sdk = { iterateFolderChildren: jest.fn() };
        const q = createQueue(sdk);
        await expect(
            q.enqueueRemotePaths(['/x'], '/out', async () => albumNode),
        ).rejects.toThrow('Unsupported node type for download');
    });

    it('enqueueRemoteFolderChildren enqueues each iterated child', async () => {
        const subFolder = mockFolderMaybe('sub', 'subuid');
        async function* children() {
            yield file;
            yield subFolder;
        }
        const sdk = { iterateFolderChildren: jest.fn().mockReturnValue(children()) };
        const q = createQueue(sdk);
        await q.enqueueRemoteFolderChildren(folder, '/local/out');
        expect(sdk.iterateFolderChildren).toHaveBeenCalledWith(folder);
        expect(q['queue']).toEqual([
            {
                kind: 'file',
                remoteNode: file,
                baseName: 'remote.txt',
                localPath: path.join(path.resolve('/local/out'), 'remote.txt'),
            },
            {
                kind: 'directory',
                remoteNode: subFolder,
                baseName: 'sub',
                localPath: path.join(path.resolve('/local/out'), 'sub'),
            },
        ]);
    });
});
