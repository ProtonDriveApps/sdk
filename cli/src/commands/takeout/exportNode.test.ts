import { Author, MemberRole, NodeEntity, NodeType, Revision, RevisionState } from '@protontech/drive-sdk';

jest.mock('../fileSystem/downloadOperations', () => ({
    createLocalFolder: jest.fn(),
    downloadRemoteFile: jest.fn(),
    isUnsupportedForDownload: jest.fn().mockReturnValue(false),
}));
jest.mock('./writeManifest', () => ({
    writeJsonFile: jest.fn(),
}));

import type { DownloadContext } from '../fileSystem/downloadOperations';
import { createLocalFolder, downloadRemoteFile } from '../fileSystem/downloadOperations';
import type { QueueItemFile } from '../fileSystem/transferQueue';
import { ALREADY_EXISTS_MESSAGE } from './const';
import { buildNodeManifest, exportNode, serializeAuthor, serializeExtendedAttributes } from './exportNode';
import type { TakeoutFileData, TakeoutNodeContext } from './interface';
import { writeJsonFile } from './writeManifest';

const verifiedAuthor: Author = { ok: true, value: 'alice@example.com' };

function mockRevision(overrides: Partial<Revision> = {}): Revision {
    return {
        uid: 'volumeId~nodeId~revisionId',
        state: RevisionState.Active,
        creationTime: new Date('2024-01-15T10:30:00.000Z'),
        contentAuthor: { ok: true, value: 'bob@example.com' },
        storageSize: 484352,
        isImported: false,
        claimedSize: 481209,
        claimedModificationTime: new Date('2024-01-15T10:29:58.000Z'),
        claimedDigests: { sha1: 'abc123', sha1Verified: true },
        claimedAdditionalMetadata: { camera: 'Pixel' },
        ...overrides,
    };
}

function mockFileNode(overrides: Partial<NodeEntity> = {}): NodeEntity {
    return {
        uid: 'volumeId~nodeId',
        name: { ok: true, value: 'notes.txt' },
        keyAuthor: verifiedAuthor,
        nameAuthor: { ok: true, value: 'bob@example.com' },
        directRole: MemberRole.Admin,
        ownedBy: { email: 'alice@example.com' },
        type: NodeType.File,
        isShared: false,
        isSharedByUrl: false,
        mediaType: 'text/plain',
        creationTime: new Date('2024-01-01T00:00:00.000Z'),
        modificationTime: new Date('2024-01-02T00:00:00.000Z'),
        treeEventScopeId: 'scope',
        activeRevision: mockRevision(),
        ...overrides,
    };
}

describe('exportNode with revisions', () => {
    const activeRevision = mockRevision({ uid: 'volumeId~nodeId~activeRevisionId' });
    const olderRevision = mockRevision({
        uid: 'volumeId~nodeId~olderRevisionId',
        state: RevisionState.Superseded,
        creationTime: new Date('2023-11-02T08:12:00.000Z'),
    });
    const node = mockFileNode({ name: { ok: true, value: 'report.pdf' }, activeRevision });

    const item: QueueItemFile<TakeoutFileData> = {
        kind: 'file',
        remoteNode: node,
        localPath: '/takeout/my-files/report.pdf',
        baseName: 'report.pdf',
        manifestName: 'report.pdf.manifest.json',
    };

    function mockContext(): TakeoutNodeContext {
        return {
            download: {} as DownloadContext,
            exportRevisions: true,
            iterateRevisions: async function* () {
                yield activeRevision;
                yield olderRevision;
            },
        };
    }

    beforeEach(() => {
        jest.mocked(createLocalFolder).mockResolvedValue('/takeout/my-files/report.pdf');
        jest.mocked(writeJsonFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('writes the manifest with the revisions that failed and reports them back', async () => {
        jest.mocked(downloadRemoteFile).mockImplementation(async (_ctx, revisionItem) => {
            if (revisionItem.revision?.uid === olderRevision.uid) {
                throw new Error('Decryption failed');
            }
            return 481209;
        });

        const result = await exportNode(mockContext(), item);

        expect(result).toEqual({
            kind: 'revisions',
            bytes: 481209,
            errors: [new Error('Decryption failed')],
        });
        expect(writeJsonFile).toHaveBeenCalledWith(
            '/takeout/my-files/report.pdf/manifest.json',
            expect.objectContaining({
                latestRevision: expect.objectContaining({ uid: activeRevision.uid }),
                previousRevisions: undefined,
                failedRevisions: [
                    {
                        uid: olderRevision.uid,
                        creationTime: '2023-11-02T08:12:00.000Z',
                        error: 'Error: Decryption failed',
                    },
                ],
            }),
        );
    });

    it('records skipped revisions in the manifest without reporting them as errors', async () => {
        jest.mocked(downloadRemoteFile).mockImplementation(async (_ctx, revisionItem) => {
            if (revisionItem.revision?.uid === olderRevision.uid) {
                return false;
            }
            return 481209;
        });

        const result = await exportNode(mockContext(), item);

        expect(result).toEqual({
            kind: 'revisions',
            bytes: 481209,
            errors: [],
        });
        expect(writeJsonFile).toHaveBeenCalledWith(
            '/takeout/my-files/report.pdf/manifest.json',
            expect.objectContaining({
                latestRevision: expect.objectContaining({ uid: activeRevision.uid }),
                previousRevisions: undefined,
                failedRevisions: [
                    {
                        uid: olderRevision.uid,
                        creationTime: '2023-11-02T08:12:00.000Z',
                        error: ALREADY_EXISTS_MESSAGE,
                    },
                ],
            }),
        );
    });

    it('reports all revisions as failed when none could be exported', async () => {
        jest.mocked(downloadRemoteFile).mockRejectedValue(new Error('Decryption failed'));

        const result = await exportNode(mockContext(), item);

        expect(result).toEqual({
            kind: 'revisions',
            bytes: 0,
            errors: [new Error('Decryption failed'), new Error('Decryption failed')],
        });
        expect(writeJsonFile).toHaveBeenCalledWith(
            '/takeout/my-files/report.pdf/manifest.json',
            expect.objectContaining({
                latestRevision: undefined,
                failedRevisions: [
                    expect.objectContaining({ uid: activeRevision.uid, error: 'Error: Decryption failed' }),
                    expect.objectContaining({ uid: olderRevision.uid, error: 'Error: Decryption failed' }),
                ],
            }),
        );
    });
});

describe('buildNodeManifest', () => {
    it('describes the node and the one revision that was exported', () => {
        const node = mockFileNode();

        expect(buildNodeManifest(node, { revision: node.activeRevision!, fileName: 'notes.txt' })).toEqual({
            originalName: 'notes.txt',
            uid: 'volumeId~nodeId',
            keyAuthor: { email: 'alice@example.com', verified: true },
            nameAuthor: { email: 'bob@example.com', verified: true },
            mediaType: 'text/plain',
            latestRevision: {
                uid: 'volumeId~nodeId~revisionId',
                contentAuthor: { email: 'bob@example.com', verified: true },
                extendedAttributes: {
                    claimedModificationTime: '2024-01-15T10:29:58.000Z',
                    claimedAdditionalMetadata: { camera: 'Pixel' },
                },
                creationTime: '2024-01-15T10:30:00.000Z',
                path: './notes.txt',
            },
            previousRevisions: undefined,
            failedRevisions: undefined,
        });
    });

    it('lists the older versions when they were exported too', () => {
        const node = mockFileNode();
        const older = mockRevision({
            uid: 'volumeId~nodeId~olderRevisionId',
            state: RevisionState.Superseded,
            creationTime: new Date('2023-11-02T08:12:00.000Z'),
        });

        const manifest = buildNodeManifest(
            node,
            { revision: node.activeRevision!, fileName: '2024-01-15T10-30-00Z_revisionId.txt' },
            [{ revision: older, fileName: '2023-11-02T08-12-00Z_olderRevisionId.txt' }],
        );

        expect(manifest.latestRevision?.path).toBe('./2024-01-15T10-30-00Z_revisionId.txt');
        expect(manifest.previousRevisions).toEqual([
            expect.objectContaining({
                uid: 'volumeId~nodeId~olderRevisionId',
                creationTime: '2023-11-02T08:12:00.000Z',
                path: './2023-11-02T08-12-00Z_olderRevisionId.txt',
            }),
        ]);
        expect(manifest.failedRevisions).toBeUndefined();
    });

    it('lists the versions that could not be exported, so a partial folder is explained', () => {
        const node = mockFileNode();
        const broken = mockRevision({
            uid: 'volumeId~nodeId~brokenRevisionId',
            state: RevisionState.Superseded,
            creationTime: new Date('2023-08-14T19:02:00.000Z'),
        });

        const manifest = buildNodeManifest(
            node,
            { revision: node.activeRevision!, fileName: '2024-01-15T10-30-00Z_revisionId.txt' },
            [],
            [{ revision: broken, error: new Error('Decryption failed') }],
        );

        expect(manifest.previousRevisions).toBeUndefined();
        expect(manifest.failedRevisions).toEqual([
            {
                uid: 'volumeId~nodeId~brokenRevisionId',
                creationTime: '2023-08-14T19:02:00.000Z',
                error: 'Error: Decryption failed',
            },
        ]);
    });
});

describe('serializeAuthor', () => {
    it('serializes a verified author', () => {
        expect(serializeAuthor(verifiedAuthor)).toEqual({ email: 'alice@example.com', verified: true });
    });

    it('serializes an anonymous author', () => {
        expect(serializeAuthor({ ok: true, value: null })).toEqual({ email: null, verified: true });
    });

    it('serializes an unverified author with the claimed email and the reason', () => {
        const author: Author = {
            ok: false,
            error: { claimedAuthor: 'bob@example.com', error: 'Signature could not be verified' },
        };

        expect(serializeAuthor(author)).toEqual({
            email: 'bob@example.com',
            verified: false,
            error: 'Signature could not be verified',
        });
    });

    it('serializes an unverified author without a claimed email', () => {
        expect(serializeAuthor({ ok: false, error: { error: 'Missing signature' } })).toEqual({
            email: null,
            verified: false,
            error: 'Missing signature',
        });
    });
});

describe('serializeExtendedAttributes', () => {
    it('exports the claimed metadata the SDK exposes', () => {
        expect(serializeExtendedAttributes(mockRevision())).toEqual({
            claimedModificationTime: '2024-01-15T10:29:58.000Z',
            claimedAdditionalMetadata: { camera: 'Pixel' },
        });
    });

    it('omits claimed metadata that is not available', () => {
        const revision = mockRevision({
            claimedModificationTime: undefined,
            claimedSize: undefined,
            claimedDigests: undefined,
            claimedAdditionalMetadata: undefined,
        });

        expect(JSON.parse(JSON.stringify(serializeExtendedAttributes(revision)))).toEqual({});
    });
});
