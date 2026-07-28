import { MemberRole, NodeEntity, NodeType, ThumbnailType, ValidationError } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

jest.mock('../../cli', () => ({
    PathType: jest.requireActual('../../cli/paths').PathType,
}));
jest.mock('./transferProgress', () => ({
    createTransferProgress: jest.fn(),
}));
jest.mock('./digest');
jest.mock('./generateThumbnails');

import { getFileMetadata } from './commandFileSystemUpload';
import { getSha1 } from './digest';
import { generateThumbnails } from './generateThumbnails';
import type { QueueItemFile } from './transferQueue';

const getSha1Mock = getSha1 as jest.MockedFunction<typeof getSha1>;
const generateThumbnailsMock = generateThumbnails as jest.MockedFunction<typeof generateThumbnails>;

const mockAuthor = { ok: true as const, value: 'a@b.c' };

function mockFolderNode(name: string, uid: string): NodeEntity {
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
    };
}

describe('getFileMetadata', () => {
    const bunFile = jest.fn();
    const logger = getMockLogger();
    const noAdditionalMetadata: any = async () => ({});

    beforeAll(() => {
        globalThis.Bun = { file: bunFile } as any;
    });

    beforeEach(() => {
        bunFile.mockReset();
        getSha1Mock.mockReset();
        generateThumbnailsMock.mockReset();
    });

    const item: QueueItemFile<{ parentNode: NodeEntity }> = {
        kind: 'file',
        localPath: '/tmp/upload.txt',
        baseName: 'upload.txt',
        parentNode: mockFolderNode('parent', 'p1'),
    };

    function mockBunFile(overrides: { size?: number; lastModified?: number } = {}) {
        const mockFile = {
            size: overrides.size ?? 42,
            lastModified: overrides.lastModified ?? 1_700_000_000_000,
            stream: jest.fn(),
        };
        bunFile.mockReturnValue(mockFile);
        return mockFile;
    }

    it('returns metadata assembled from local file info', async () => {
        const mockFile = mockBunFile();
        getSha1Mock.mockResolvedValue('abc123');
        generateThumbnailsMock.mockResolvedValue([]);

        const result = await getFileMetadata(
            { skipThumbnails: false, logger },
            item,
            'text/plain',
            noAdditionalMetadata,
        );

        expect(getSha1Mock).toHaveBeenCalledWith(item.localPath);
        expect(bunFile).toHaveBeenCalledWith(item.localPath);
        expect(generateThumbnailsMock).toHaveBeenCalledWith('text/plain', item.localPath);
        expect(result.file).toBe(mockFile);
        expect(result.metadata).toEqual({
            mediaType: 'text/plain',
            expectedSize: 42,
            expectedSha1: 'abc123',
            modificationTime: new Date(1_700_000_000_000),
        });
        expect(result.thumbnails).toEqual([]);
    });

    it('omits modificationTime when lastModified is zero', async () => {
        mockBunFile({ size: 10, lastModified: 0 });
        getSha1Mock.mockResolvedValue('deadbeef');
        generateThumbnailsMock.mockResolvedValue([]);

        const result = await getFileMetadata(
            { skipThumbnails: true, logger },
            item,
            'application/octet-stream',
            noAdditionalMetadata,
        );

        expect(result.metadata).toEqual({
            mediaType: 'application/octet-stream',
            expectedSize: 10,
            expectedSha1: 'deadbeef',
            modificationTime: undefined,
        });
    });

    it('skips thumbnail generation when skipThumbnails is true', async () => {
        mockBunFile();
        getSha1Mock.mockResolvedValue('abc123');

        const result = await getFileMetadata(
            { skipThumbnails: true, logger },
            item,
            'image/jpeg',
            noAdditionalMetadata,
        );

        expect(generateThumbnailsMock).not.toHaveBeenCalled();
        expect(result.thumbnails).toEqual([]);
    });

    it('includes generated thumbnails when skipThumbnails is false', async () => {
        mockBunFile();
        getSha1Mock.mockResolvedValue('abc123');
        const thumbnails = [{ type: ThumbnailType.Type1, thumbnail: new Uint8Array([1, 2, 3]) }];
        generateThumbnailsMock.mockResolvedValue(thumbnails);

        const result = await getFileMetadata(
            { skipThumbnails: false, logger },
            item,
            'image/jpeg',
            noAdditionalMetadata,
        );

        expect(result.thumbnails).toBe(thumbnails);
    });

    it('wraps thumbnail generation errors in ValidationError', async () => {
        mockBunFile();
        getSha1Mock.mockResolvedValue('abc123');
        generateThumbnailsMock.mockRejectedValue(new Error('decode failed'));

        await expect(
            getFileMetadata({ skipThumbnails: false, logger }, item, 'image/jpeg', noAdditionalMetadata),
        ).rejects.toThrow(ValidationError);
        await expect(
            getFileMetadata({ skipThumbnails: false, logger }, item, 'image/jpeg', noAdditionalMetadata),
        ).rejects.toThrow(
            'Failed to generate thumbnails (use --skip-thumbnails to upload without thumbnails): decode failed',
        );
    });

    it('wraps non-Error thumbnail generation failures in ValidationError', async () => {
        mockBunFile();
        getSha1Mock.mockResolvedValue('abc123');
        generateThumbnailsMock.mockRejectedValue('decode failed');

        await expect(
            getFileMetadata({ skipThumbnails: false, logger }, item, 'image/jpeg', noAdditionalMetadata),
        ).rejects.toThrow(
            'Failed to generate thumbnails (use --skip-thumbnails to upload without thumbnails): decode failed',
        );
    });
});
