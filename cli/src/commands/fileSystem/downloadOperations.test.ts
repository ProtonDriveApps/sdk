import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
    FileDownloader,
    IntegrityError,
    MemberRole,
    NodeEntity,
    NodeType,
    ValidationError,
} from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

import type { CliMetrics } from '../../telemetry';
import { getSha1 } from './digest';
import {
    createLocalFolder,
    type DownloadContext,
    downloadRemoteFile,
    ensureDirectory,
} from './downloadOperations';
import {
    ConflictChoice,
    ConflictTargetKind,
    TransferConflictResolver,
} from './transferConflictResolver';
import type { QueueItemDirectory, QueueItemFile } from './transferQueue';

jest.mock('node:fs/promises', () => ({
    mkdir: jest.fn(),
    readdir: jest.fn(),
    rm: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
}));

jest.mock('./digest');
jest.mock('../../cli', () => jest.requireActual('../../cli/node'));

const mkdirMock = mkdir as jest.MockedFunction<typeof mkdir>;
const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const rmMock = rm as jest.MockedFunction<typeof rm>;
const statMock = stat as jest.MockedFunction<typeof stat>;
const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;
const getSha1Mock = getSha1 as jest.MockedFunction<typeof getSha1>;

const mockAuthor = { ok: true as const, value: 'author@example.com' };
const downloadRoot = path.resolve('/safe/root');

function eexistError(): NodeJS.ErrnoException {
    const error = new Error('EEXIST') as NodeJS.ErrnoException;
    error.code = 'EEXIST';
    return error;
}

function mockDirStat(): Awaited<ReturnType<typeof stat>> {
    return {
        isDirectory: () => true,
        isFile: () => false,
    } as Awaited<ReturnType<typeof stat>>;
}

function mockFileStat(): Awaited<ReturnType<typeof stat>> {
    return {
        isDirectory: () => false,
        isFile: () => true,
    } as Awaited<ReturnType<typeof stat>>;
}

function mockFileNode(
    name: string,
    uid: string,
    overrides: Partial<NodeEntity> = {},
): NodeEntity {
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

function mockMetrics(): CliMetrics {
    return {
        reportUploadVerifierAttempt: jest.fn(),
        reportDownloadVerifierAttempt: jest.fn(),
    };
}

function createConflictResolver(
    options: {
        forcedFileStrategy?: string;
        forcedFolderStrategy?: string;
    } = {},
): TransferConflictResolver {
    return new TransferConflictResolver(getMockLogger(), options);
}

describe('createLocalFolder', () => {
    beforeEach(() => {
        mkdirMock.mockReset();
        readdirMock.mockReset();
        rmMock.mockReset();
    });

    function directoryItem(name: string): QueueItemDirectory<{ remoteNode: NodeEntity }> {
        const localPath = path.join(downloadRoot, name);
        return {
            kind: 'directory',
            localPath,
            baseName: name,
            remoteNode: mockFileNode(name, 'remote-dir'),
        };
    }

    it('creates a new folder and returns its path', async () => {
        mkdirMock.mockResolvedValue(undefined);
        const item = directoryItem('newfolder');

        const result = await createLocalFolder(
            { downloadRoot, conflictResolver: createConflictResolver({ forcedFolderStrategy: 'skip' }) },
            item,
        );

        expect(result).toBe(item.localPath);
        expect(mkdirMock).toHaveBeenCalledWith(item.localPath);
    });

    it('returns undefined when the user skips a folder conflict', async () => {
        mkdirMock.mockRejectedValue(eexistError());
        const conflictResolver = createConflictResolver({ forcedFolderStrategy: 'skip' });
        const resolveSpy = jest.spyOn(conflictResolver, 'resolve');
        const item = directoryItem('existing');

        const result = await createLocalFolder({ downloadRoot, conflictResolver }, item);

        expect(result).toBeUndefined();
        expect(resolveSpy).toHaveBeenCalledWith('existing', ConflictTargetKind.Folder);
    });

    it('returns the existing path when the user chooses merge', async () => {
        mkdirMock.mockRejectedValue(eexistError());
        const item = directoryItem('existing');

        const result = await createLocalFolder(
            { downloadRoot, conflictResolver: createConflictResolver({ forcedFolderStrategy: 'merge' }) },
            item,
        );

        expect(result).toBe(item.localPath);
    });

    it('replaces an existing folder and creates it again', async () => {
        mkdirMock.mockRejectedValueOnce(eexistError()).mockResolvedValueOnce(undefined);
        rmMock.mockResolvedValue(undefined);
        const item = directoryItem('existing');

        const result = await createLocalFolder(
            { downloadRoot, conflictResolver: createConflictResolver({ forcedFolderStrategy: 'replace' }) },
            item,
        );

        expect(result).toBe(item.localPath);
        expect(rmMock).toHaveBeenCalledWith(item.localPath, { recursive: true, force: true });
        expect(mkdirMock).toHaveBeenCalledTimes(2);
    });

    it('keeps both folders by picking an available local name', async () => {
        mkdirMock.mockRejectedValueOnce(eexistError()).mockResolvedValueOnce(undefined);
        readdirMock.mockResolvedValue(['existing'] as unknown as Awaited<ReturnType<typeof readdir>>);
        const item = directoryItem('existing');

        const result = await createLocalFolder(
            { downloadRoot, conflictResolver: createConflictResolver({ forcedFolderStrategy: 'keep-both' }) },
            item,
        )

        expect(result).toBe(path.join(downloadRoot, 'existing (1)'));
    });
});

describe('downloadRemoteFile', () => {
    const bunFile = jest.fn();
    let mockWriter: { end: jest.Mock };
    let mockBunFileObject: { writer: jest.Mock; size: number };

    beforeAll(() => {
        globalThis.Bun = { file: bunFile } as any;
    });

    beforeEach(() => {
        mkdirMock.mockReset();
        readdirMock.mockReset();
        statMock.mockReset();
        unlinkMock.mockReset();
        getSha1Mock.mockReset();
        bunFile.mockReset();

        unlinkMock.mockResolvedValue(undefined);
        mockWriter = { end: jest.fn().mockResolvedValue(undefined) };
        mockBunFileObject = {
            writer: jest.fn(() => mockWriter),
            size: 512,
        };
        bunFile.mockReturnValue(mockBunFileObject);

        mkdirMock.mockResolvedValue(undefined);
        statMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        getSha1Mock.mockResolvedValue('abc123');
    });

    function fileItem(
        name: string,
        overrides: Partial<QueueItemFile<{ remoteNode: NodeEntity }>> = {},
    ): QueueItemFile<{ remoteNode: NodeEntity }> {
        const localPath = path.join(downloadRoot, name);
        return {
            kind: 'file',
            localPath,
            baseName: name,
            remoteNode: mockFileNode(name, 'remote-file', {
                mediaType: 'text/plain',
                activeRevision: {
                    claimedSize: 512,
                    claimedDigests: {
                        sha1: 'abc123',
                        sha1Verified: true,
                    },
                } as NodeEntity['activeRevision'],
            }),
            ...overrides,
        };
    }

    function mockDownloader(): FileDownloader {
        const controller = {
            completion: jest.fn().mockResolvedValue(undefined),
        };
        return {
            downloadToStream: jest.fn((_stream, onProgress) => {
                onProgress?.(256);
                return controller;
            }),
        } as unknown as FileDownloader;
    }

    function downloadContext(
        overrides: Partial<DownloadContext> = {},
    ): DownloadContext {
        return {
            logger: getMockLogger(),
            conflictResolver: createConflictResolver({ forcedFileStrategy: 'replace' }),
            downloadRoot,
            getFileDownloader: jest.fn(async () => mockDownloader()),
            ...overrides,
        };
    }

    it('returns false for Proton documents', async () => {
        const item = fileItem('doc.proton', {
            remoteNode: mockFileNode('doc.proton', 'doc', {
                mediaType: 'application/vnd.proton.doc',
            }),
        });

        await expect(downloadRemoteFile(downloadContext(), item)).resolves.toBe(false);
        expect(mkdirMock).not.toHaveBeenCalled();
    });

    it('returns false for Proton sheets', async () => {
        const item = fileItem('sheet.proton', {
            remoteNode: mockFileNode('sheet.proton', 'sheet', {
                mediaType: 'application/vnd.proton.sheet',
            }),
        });

        await expect(downloadRemoteFile(downloadContext(), item)).resolves.toBe(false);
    });

    it('returns false when the user skips a file conflict', async () => {
        statMock.mockResolvedValue(mockFileStat());
        const item = fileItem('report.txt');

        await expect(
            downloadRemoteFile(
                downloadContext({ conflictResolver: createConflictResolver({ forcedFileStrategy: 'skip' }) }),
                item,
            ),
        ).resolves.toBe(false);
    });

    it('downloads a new file and returns its size', async () => {
        const item = fileItem('report.txt');
        const ctx = downloadContext();
        const metrics = mockMetrics();

        await expect(downloadRemoteFile({ ...ctx, metrics }, item)).resolves.toBe(512);

        expect(ctx.getFileDownloader).toHaveBeenCalledWith(item.remoteNode);
        expect(getSha1Mock).toHaveBeenCalledWith(item.localPath);
        expect(metrics.reportDownloadVerifierAttempt).toHaveBeenCalledWith({
            result: 'success',
            fileSize: 512,
            checksumVerified: true,
        });
    });

    it('replaces an existing file before downloading', async () => {
        statMock.mockResolvedValueOnce(mockFileStat()).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        unlinkMock.mockResolvedValue(undefined);
        const item = fileItem('report.txt');

        await expect(downloadRemoteFile(downloadContext(), item)).resolves.toBe(512);
        expect(unlinkMock).toHaveBeenCalledWith(item.localPath);
    });

    it('keeps both files by downloading to an available local name', async () => {
        statMock.mockResolvedValueOnce(mockFileStat()).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        readdirMock.mockResolvedValue(['report.txt'] as unknown as Awaited<ReturnType<typeof readdir>>);
        const item = fileItem('report.txt');
        const renamedPath = path.join(downloadRoot, 'report (1).txt');

        await expect(
            downloadRemoteFile(
                downloadContext({ conflictResolver: createConflictResolver({ forcedFileStrategy: 'keep-both' }) }),
                item,
            ),
        ).resolves.toBe(512);
        expect(bunFile).toHaveBeenCalledWith(renamedPath);
    });

    it('skips checksum verification when no expected SHA1 is available', async () => {
        const item = fileItem('report.txt', {
            remoteNode: mockFileNode('report.txt', 'remote-file', {
                mediaType: 'text/plain',
                activeRevision: {
                    claimedSize: 512,
                    claimedDigests: {},
                } as NodeEntity['activeRevision'],
            }),
        });
        const metrics = mockMetrics();

        await expect(downloadRemoteFile(downloadContext({ metrics }), item)).resolves.toBe(512);

        expect(getSha1Mock).not.toHaveBeenCalled();
        expect(metrics.reportDownloadVerifierAttempt).toHaveBeenCalledWith({
            result: 'skipped',
            fileSize: 512,
            checksumVerified: false,
        });
    });

    it('throws IntegrityError when checksum verification fails for a verified revision', async () => {
        getSha1Mock.mockResolvedValue('different-sha1');
        const logger = getMockLogger();
        const item = fileItem('report.txt');
        const metrics = mockMetrics();

        await expect(
            downloadRemoteFile(downloadContext({ logger, metrics }), item),
        ).rejects.toBeInstanceOf(IntegrityError);

        expect(logger.error).toHaveBeenCalledWith(
            'Integrity verification failed: computedSha1=different-sha1 expectedSha1=abc123',
        );
        expect(metrics.reportDownloadVerifierAttempt).toHaveBeenCalledWith({
            result: 'failure',
            fileSize: 512,
            checksumVerified: true,
        });
        expect(unlinkMock).toHaveBeenCalledWith(item.localPath);
    });

    it('cleans up the partial file and rethrows when the download fails', async () => {
        const downloader = {
            downloadToStream: jest.fn(() => ({
                completion: jest.fn().mockRejectedValue(new Error('network error')),
            })),
        } as unknown as FileDownloader;
        const item = fileItem('report.txt');

        await expect(
            downloadRemoteFile(
                downloadContext({ getFileDownloader: jest.fn(async () => downloader) }),
                item,
            ),
        ).rejects.toThrow('network error');

        expect(unlinkMock).toHaveBeenCalledWith(item.localPath);
        expect(mockWriter.end).toHaveBeenCalled();
    });

    it('throws ValidationError for an unexpected conflict choice', async () => {
        statMock.mockResolvedValue(mockFileStat());
        const item = fileItem('report.txt');

        await expect(
            downloadRemoteFile(
                downloadContext({
                    conflictResolver: {
                        resolve: jest.fn(async () => ConflictChoice.Merge),
                    } as unknown as TransferConflictResolver,
                }),
                item,
            ),
        ).rejects.toThrow(new ValidationError(`Unexpected conflict choice: ${ConflictChoice.Merge}`));
    });
});

describe('ensureDirectory', () => {
    beforeEach(() => {
        mkdirMock.mockReset();
        statMock.mockReset();
    });

    it('creates the directory recursively', async () => {
        mkdirMock.mockResolvedValue(undefined);

        await ensureDirectory('/tmp/parent/child');

        expect(mkdirMock).toHaveBeenCalledWith('/tmp/parent/child', { recursive: true });
    });

    it('ignores EEXIST when the path is already a directory', async () => {
        mkdirMock.mockRejectedValue(eexistError());
        statMock.mockResolvedValue(mockDirStat());

        await expect(ensureDirectory('/tmp/existing-dir')).resolves.toBeUndefined();
        expect(statMock).toHaveBeenCalledWith('/tmp/existing-dir');
    });

    it('rethrows EEXIST when the path is not a directory', async () => {
        const error = eexistError();
        mkdirMock.mockRejectedValue(error);
        statMock.mockResolvedValue(mockFileStat());

        await expect(ensureDirectory('/tmp/existing-file')).rejects.toBe(error);
    });

    it('rethrows non-EEXIST errors', async () => {
        const error = new Error('permission denied');
        mkdirMock.mockRejectedValue(error);

        await expect(ensureDirectory('/tmp/forbidden')).rejects.toBe(error);
        expect(statMock).not.toHaveBeenCalled();
    });
});
