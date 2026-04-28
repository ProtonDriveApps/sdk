import { Dirent } from 'node:fs';
import path from 'node:path';

import { ValidationError, NodeType, ProtonDriveClient, MaybeNode, MemberRole } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

jest.mock('../../cli', () => jest.requireActual('../../cli/node'));

jest.mock('node:fs/promises', () => ({
    readdir: jest.fn(),
    lstat: jest.fn(),
}));

import { readdir, lstat } from 'node:fs/promises';

import { MAX_CONCURRENT_ITEMS, UploadQueue, DownloadQueue, QueueItem } from './transferQueue';

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const lstatMock = lstat as jest.MockedFunction<typeof lstat>;

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

function mockFolderMaybe(name: string, uid: string): MaybeNode {
    return {
        ok: true,
        value: {
            uid,
            name,
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
        },
    };
}

function mockFileMaybe(name: string, uid: string): MaybeNode {
    return {
        ok: true,
        value: {
            uid,
            name,
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
        },
    };
}

class SeededUploadQueue extends UploadQueue {
    seed(items: QueueItem<{ parentNode: MaybeNode }>[]) {
        this.queue.push(...items);
    }
}

describe('TransferQueue (via UploadQueue.processQueue)', () => {
    const parent = mockFolderMaybe('parent', 'p1');

    it('resolves immediately for an empty queue', async () => {
        const onDirectory = jest.fn();
        const startFile = jest.fn();
        const q = new UploadQueue(getMockLogger(), { onDirectory, startFile });
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
        });
        const startFile = jest.fn(async () => {
            order.push('file');
        });
        const q = new SeededUploadQueue(getMockLogger(), { onDirectory, startFile });
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
        const onDirectory = jest.fn();
        const startFile = jest.fn(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setImmediate(r));
            inFlight--;
        });
        const q = new SeededUploadQueue(getMockLogger(), { onDirectory, startFile });
        const items: QueueItem<{ parentNode: MaybeNode }>[] = [];
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

    it('waits for all in-flight file transfers before finishing', async () => {
        const pending: Array<() => void> = [];
        const onDirectory = jest.fn();
        const startFile = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    pending.push(resolve);
                }),
        );
        const q = new SeededUploadQueue(getMockLogger(), { onDirectory, startFile });
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
        const q = new SeededUploadQueue(getMockLogger(), {
            onDirectory: jest.fn(),
            startFile: jest.fn(),
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
        const q = new SeededUploadQueue(getMockLogger(), {
            onDirectory: jest.fn(),
            startFile: jest.fn(),
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
        const q = new UploadQueue(getMockLogger(), { onDirectory: jest.fn(), startFile: jest.fn() });
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
        const q = new UploadQueue(getMockLogger(), { onDirectory: jest.fn(), startFile: jest.fn() });
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
        const q = new UploadQueue(getMockLogger(), { onDirectory: jest.fn(), startFile: jest.fn() });
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
        const q = new SeededUploadQueue(getMockLogger(), {
            onDirectory: jest.fn(),
            startFile: jest.fn(),
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
        const q = new UploadQueue(getMockLogger(), { onDirectory: jest.fn(), startFile: jest.fn() });
        await expect(q.enqueueLocalDirectoryChildren('/parent', parent)).rejects.toThrow(
            'Cannot traverse into a different file system (mount point)',
        );
    });
});

describe('DownloadQueue', () => {
    const folder = mockFolderMaybe('remoteDir', 'rf');
    const file = mockFileMaybe('remote.txt', 'rfile');

    function createQueue(sdk: Pick<ProtonDriveClient, 'iterateFolderChildren'>) {
        return new DownloadQueue(getMockLogger(), sdk as ProtonDriveClient, {
            onDirectory: jest.fn(),
            startFile: jest.fn(),
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

    it('enqueueRemoteNode rejects unsupported node types', async () => {
        const albumNode = {
            ok: true,
            value: {
                uid: 'al',
                name: 'album',
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
            },
        } as MaybeNode;
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
