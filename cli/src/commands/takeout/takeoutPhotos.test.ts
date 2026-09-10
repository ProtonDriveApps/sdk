import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { MaybeMissingPhotoNode, PhotoNode } from '@protontech/drive-sdk';
import { MemberRole, NodeType, ProtonDriveClient } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

type TimelineItem = {
    nodeUid: string;
    captureTime: Date;
    tags: [];
};

type AlbumItem = {
    nodeUid: string;
    captureTime: Date;
};

jest.mock('node:fs/promises', () => ({
    readdir: jest.fn(),
}));
jest.mock('../../cli', () => jest.requireActual('../../cli/node'));
jest.mock('./exportNode', () => ({
    exportNode: jest.fn(),
}));
jest.mock('./writeManifest', () => ({
    writeJsonFile: jest.fn(),
}));

import { TransferSummary } from '../fileSystem/transferSummary';
import { MANIFEST_FILE_NAME } from './const';
import { exportNode } from './exportNode';
import type { TakeoutContext } from './interface';
import { takeoutPhotos } from './takeoutPhotos';
import { writeJsonFile } from './writeManifest';

const readdirMock = readdir as jest.MockedFunction<typeof readdir>;
const mockAuthor = { ok: true as const, value: 'author@example.com' };

async function* iterateTimeline(...items: TimelineItem[]): AsyncIterable<TimelineItem> {
    for (const item of items) {
        yield item;
    }
}

async function* iterateNodes(...nodes: MaybeMissingPhotoNode[]): AsyncIterable<MaybeMissingPhotoNode> {
    for (const node of nodes) {
        yield node;
    }
}

async function* iterateAlbums(...albums: PhotoNode[]): AsyncIterable<PhotoNode> {
    for (const album of albums) {
        yield album;
    }
}

function mockPhotoNode(overrides: Partial<PhotoNode> = {}): PhotoNode {
    return {
        uid: 'photo-uid-1',
        name: { ok: true, value: 'IMG_0001.jpg' },
        type: NodeType.Photo,
        keyAuthor: mockAuthor,
        nameAuthor: mockAuthor,
        directRole: MemberRole.Admin,
        ownedBy: {},
        isShared: false,
        isSharedByUrl: false,
        creationTime: new Date('2024-01-15T10:00:00.000Z'),
        modificationTime: new Date('2024-01-15T10:00:00.000Z'),
        treeEventScopeId: 'scope',
        photo: {
            captureTime: new Date('2024-03-15T14:30:00.000Z'),
            relatedPhotoNodeUids: [],
            albums: [],
            tags: [],
        },
        ...overrides,
    };
}

function mockAlbum(overrides: Partial<PhotoNode> = {}): PhotoNode {
    return {
        uid: 'album-uid-1',
        name: { ok: true, value: 'Vacation' },
        type: NodeType.Album,
        keyAuthor: mockAuthor,
        nameAuthor: mockAuthor,
        directRole: MemberRole.Admin,
        ownedBy: {},
        isShared: false,
        isSharedByUrl: false,
        creationTime: new Date('2024-01-01T00:00:00.000Z'),
        modificationTime: new Date('2024-01-01T00:00:00.000Z'),
        treeEventScopeId: 'scope',
        album: {
            photoCount: 1,
            lastActivityTime: new Date('2024-01-01T00:00:00.000Z'),
        },
        ...overrides,
    };
}

function mockContext(options: {
    timeline?: TimelineItem[];
    nodes?: MaybeMissingPhotoNode[];
    albums?: PhotoNode[];
    albumItems?: Map<string, AlbumItem[]>;
    createFolder?: jest.Mock;
} = {}): TakeoutContext {
    const timeline = options.timeline ?? [];
    const nodes = options.nodes ?? [];
    const albums = options.albums ?? [];
    const albumItems = options.albumItems ?? new Map<string, AlbumItem[]>();

    const photosSdk = {
        iterateTimeline: jest.fn(() => iterateTimeline(...timeline)),
        iterateNodes: jest.fn((uids: string[]) =>
            iterateNodes(
                ...nodes.filter((node) => ('missingUid' in node ? uids.includes(node.missingUid) : uids.includes(node.uid))),
            ),
        ),
        iterateAlbums: jest.fn(() => iterateAlbums(...albums)),
        iterateAlbum: jest.fn((albumUid: string) => iterateAlbumItems(...(albumItems.get(albumUid) ?? []))),
    } as unknown as TakeoutContext['photosSdk'];

    const sdk = {} as unknown as ProtonDriveClient;

    return {
        logger: getMockLogger(),
        sdk,
        photosSdk,
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

async function* iterateAlbumItems(...items: AlbumItem[]): AsyncIterable<AlbumItem> {
    for (const item of items) {
        yield item;
    }
}

describe('takeoutPhotos', () => {
    let summary: TransferSummary;

    beforeEach(() => {
        readdirMock.mockResolvedValue([]);
        summary = new TransferSummary('download');
        jest.mocked(exportNode).mockResolvedValue({ kind: 'file', bytes: 1024 });
        jest.mocked(writeJsonFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('exports timeline photos into dated folders and writes the section manifest', async () => {
        const photo = mockPhotoNode();
        const ctx = mockContext({
            timeline: [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime, tags: [] }],
            nodes: [photo],
        });

        const section = await takeoutPhotos(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/photos');
        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/photos/timeline/2024/03');
        expect(exportNode).toHaveBeenCalledTimes(1);
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: expect.objectContaining({
                    items: [
                        expect.objectContaining({
                            path: 'timeline/2024/03/IMG_0001.jpg',
                            uid: photo.uid,
                            originalName: 'IMG_0001.jpg',
                        }),
                    ],
                }),
                albums: { items: [], skippedItems: [], errors: [] },
            }),
        );
        expect(section).toEqual({
            path: './photos',
            albumCount: 0,
            failures: false,
            transferSummary: {
                downloadedItems: 1,
                downloadedBytes: 1024,
                skippedItems: 0,
                failedItems: 0,
            },
        });
    });

    it('places photos without capture time in the undated folder', async () => {
        const photo = mockPhotoNode({
            uid: 'undated-photo',
            name: { ok: true, value: 'scan.png' },
            photo: undefined,
        });
        const ctx = mockContext({
            timeline: [{ nodeUid: photo.uid, captureTime: undefined as unknown as Date, tags: [] }],
            nodes: [photo],
        });

        await takeoutPhotos(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/photos/timeline/undated');
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: expect.objectContaining({
                    items: [
                        expect.objectContaining({
                            path: 'timeline/undated/scan.png',
                            uid: photo.uid,
                        }),
                    ],
                }),
            }),
        );
    });

    it('records missing timeline photos without downloading them', async () => {
        const ctx = mockContext({
            timeline: [{ nodeUid: 'missing-photo', captureTime: new Date('2024-03-15T14:30:00.000Z'), tags: [] }],
            nodes: [{ missingUid: 'missing-photo' }],
        });

        const section = await takeoutPhotos(ctx, summary);

        expect(exportNode).not.toHaveBeenCalled();
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: expect.objectContaining({
                    errors: [
                        {
                            uid: 'missing-photo',
                            error: 'This photo is no longer available.',
                        },
                    ],
                }),
            }),
        );
        expect(section.failures).toBe(true);
        expect(summary.getCounters().failedItems).toBe(1);
    });

    it('skips album export when timeline export fails', async () => {
        const photo = mockPhotoNode();
        const ctx = mockContext({
            timeline: [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime, tags: [] }],
            nodes: [photo],
            albums: [mockAlbum()],
            createFolder: jest.fn(async (folderPath: string) => {
                if (folderPath === '/takeout/photos/timeline/2024/03') {
                    throw new Error('Timeline folder unavailable');
                }
            }),
        });

        const section = await takeoutPhotos(ctx, summary);

        expect(ctx.photosSdk.iterateAlbums).not.toHaveBeenCalled();
        expect(section).toEqual({
            path: './photos',
            albumCount: 0,
            failures: true,
            albumsSkippedReason:
                'Album export was skipped because the photo timeline could not be exported. Error: Timeline folder unavailable',
            transferSummary: {
                downloadedItems: 0,
                downloadedBytes: 0,
                skippedItems: 0,
                failedItems: 1,
            },
        });
    });

    it('links album photos to existing timeline exports', async () => {
        const photo = mockPhotoNode();
        const album = mockAlbum();
        const ctx = mockContext({
            timeline: [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime, tags: [] }],
            nodes: [photo],
            albums: [album],
            albumItems: new Map([
                [
                    album.uid,
                    [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime }],
                ],
            ]),
        });

        const section = await takeoutPhotos(ctx, summary);

        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/photos/albums');
        expect(ctx.createFolder).toHaveBeenCalledWith('/takeout/photos/albums/Vacation');
        expect(exportNode).toHaveBeenCalledTimes(1);
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos/albums/Vacation', MANIFEST_FILE_NAME),
            expect.objectContaining({
                album: expect.objectContaining({
                    nodeUid: album.uid,
                    originalName: 'Vacation',
                    photoCount: 1,
                }),
                photos: [
                    expect.objectContaining({
                        uid: photo.uid,
                        source: 'timeline',
                        path: '../../timeline/2024/03/IMG_0001.jpg',
                    }),
                ],
                errors: [],
            }),
        );
        expect(section.albumCount).toBe(1);
        expect(section.failures).toBe(false);
    });

    it('downloads photos that exist only in an album', async () => {
        const timelinePhoto = mockPhotoNode({ uid: 'timeline-photo', name: { ok: true, value: 'timeline.jpg' } });
        const albumOnlyPhoto = mockPhotoNode({
            uid: 'album-only-photo',
            name: { ok: true, value: 'album-only.jpg' },
            photo: {
                captureTime: new Date('2024-06-01T12:00:00.000Z'),
                relatedPhotoNodeUids: [],
                albums: [],
                tags: [],
            },
        });
        const album = mockAlbum({ album: { photoCount: 2, lastActivityTime: new Date('2024-01-01T00:00:00.000Z') } });
        const ctx = mockContext({
            timeline: [{ nodeUid: timelinePhoto.uid, captureTime: timelinePhoto.photo!.captureTime, tags: [] }],
            nodes: [timelinePhoto, albumOnlyPhoto],
            albums: [album],
            albumItems: new Map([
                [
                    album.uid,
                    [
                        { nodeUid: timelinePhoto.uid, captureTime: timelinePhoto.photo!.captureTime },
                        { nodeUid: albumOnlyPhoto.uid, captureTime: albumOnlyPhoto.photo!.captureTime },
                    ],
                ],
            ]),
        });

        await takeoutPhotos(ctx, summary);

        expect(exportNode).toHaveBeenCalledTimes(2);
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos/albums/Vacation', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: expect.arrayContaining([
                    expect.objectContaining({ uid: timelinePhoto.uid, source: 'timeline' }),
                    expect.objectContaining({
                        uid: albumOnlyPhoto.uid,
                        source: 'album',
                        path: './album-only.jpg',
                    }),
                ]),
            }),
        );
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: expect.objectContaining({
                    items: expect.arrayContaining([
                        expect.objectContaining({ uid: timelinePhoto.uid }),
                        expect.objectContaining({ uid: albumOnlyPhoto.uid, path: 'albums/Vacation/album-only.jpg' }),
                    ]),
                }),
            }),
        );
    });

    it('records when a timeline photo in an album could not be exported', async () => {
        const photo = mockPhotoNode();
        const album = mockAlbum();
        const ctx = mockContext({
            timeline: [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime, tags: [] }],
            nodes: [photo],
            albums: [album],
            albumItems: new Map([
                [
                    album.uid,
                    [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime }],
                ],
            ]),
        });
        jest.mocked(exportNode).mockRejectedValue(new Error('Download failed'));

        const section = await takeoutPhotos(ctx, summary);

        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos/albums/Vacation', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: [],
                errors: [
                    {
                        uid: photo.uid,
                        error: 'This photo is in your timeline but could not be exported.',
                    },
                ],
            }),
        );
        expect(section.albumCount).toBe(1);
        expect(section.failures).toBe(true);
    });

    it('continues exporting other albums when one album export throws', async () => {
        const photo = mockPhotoNode();
        const firstAlbum = mockAlbum({ uid: 'album-1', name: { ok: true, value: 'Broken' } });
        const secondAlbum = mockAlbum({ uid: 'album-2', name: { ok: true, value: 'Good' } });
        const ctx = mockContext({
            timeline: [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime, tags: [] }],
            nodes: [photo],
            albums: [firstAlbum, secondAlbum],
            albumItems: new Map([
                [firstAlbum.uid, [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime }]],
                [secondAlbum.uid, [{ nodeUid: photo.uid, captureTime: photo.photo!.captureTime }]],
            ]),
        });
        jest.mocked(writeJsonFile).mockImplementation(async (filePath: string) => {
            if (filePath.endsWith('/photos/albums/Broken/manifest.json')) {
                throw new Error('Album manifest failed');
            }
        });

        const section = await takeoutPhotos(ctx, summary);

        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos/albums/Good', MANIFEST_FILE_NAME),
            expect.any(Object),
        );
        expect(section.albumCount).toBe(2);
        expect(section.failures).toBe(true);
        expect(summary.getCounters().failedItems).toBe(1);
    });

    it('records a section failure when the photos folder cannot be created', async () => {
        const ctx = mockContext({
            createFolder: jest.fn().mockRejectedValue(new Error('Permission denied')),
        });

        const section = await takeoutPhotos(ctx, summary);

        expect(exportNode).not.toHaveBeenCalled();
        expect(ctx.photosSdk.iterateAlbums).not.toHaveBeenCalled();
        expect(writeJsonFile).toHaveBeenCalledWith(
            path.join('/takeout/photos', MANIFEST_FILE_NAME),
            expect.objectContaining({
                photos: expect.objectContaining({
                    errors: [{ path: 'timeline', error: 'Error: Permission denied' }],
                }),
            }),
        );
        expect(section).toEqual({
            path: './photos',
            albumCount: 0,
            failures: true,
            albumsSkippedReason:
                'Album export was skipped because the photo timeline could not be exported. Error: Permission denied',
            transferSummary: {
                downloadedItems: 0,
                downloadedBytes: 0,
                skippedItems: 0,
                failedItems: 1,
            },
        });
    });
});
