import { MemberRole, NodeType } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { DriveAPIService, ErrorCode, InvalidRequirementsAPIError } from '../apiService';
import { NodeAPIService, groupNodeUidsByVolumeAndIteratePerBatch } from './apiService';
import { NodeOutOfSyncError } from './errors';

function generateAPIFileNode(linkOverrides = {}, overrides = {}) {
    const node = generateAPINode();
    return {
        Link: {
            ...node.Link,
            Type: 2,
            ...linkOverrides,
        },
        File: {
            MediaType: 'text',
            ContentKeyPacket: 'contentKeyPacket',
            ContentKeyPacketSignature: 'contentKeyPacketSig',
            TotalEncryptedSize: 42,
            ActiveRevision: {
                RevisionID: 'revisionId',
                CreateTime: 1234567890,
                SignatureEmail: 'revSigEmail',
                XAttr: '{file}',
                EncryptedSize: 12,
            },
        },
        ...overrides,
    };
}

function generateAPIFolderNode(linkOverrides = {}, overrides = {}) {
    const node = generateAPINode();
    return {
        Link: {
            ...node.Link,
            Type: 1,
            ...linkOverrides,
        },
        Folder: {
            XAttr: '{folder}',
            NodeHashKey: 'nodeHashKey',
        },
        ...overrides,
    };
}

function generateAPIAlbumNode(linkOverrides = {}, overrides = {}) {
    const node = generateAPINode();
    return {
        Link: {
            ...node.Link,
            Type: 3,
            ...linkOverrides,
        },
        ...overrides,
    };
}

function generateAPINode() {
    return {
        Link: {
            LinkID: 'linkId',
            ParentLinkID: 'parentLinkId',
            NameHash: 'nameHash',
            CreateTime: 123456789,
            TrashTime: 0,

            Name: 'encName',
            SignatureEmail: 'sigEmail',
            NameSignatureEmail: 'nameSigEmail',
            NodeKey: 'nodeKey',
            NodePassphrase: 'nodePass',
            NodePassphraseSignature: 'nodePassSig',
        },
        SharingSummary: null,
    };
}

function generateFileNode(overrides = {}, encryptedCryptoOverrides = {}) {
    const node = generateNode();
    return {
        ...node,
        type: NodeType.File,
        mediaType: 'text',
        totalStorageSize: 42,
        encryptedCrypto: {
            ...node.encryptedCrypto,
            file: {
                base64ContentKeyPacket: 'contentKeyPacket',
                armoredContentKeyPacketSignature: 'contentKeyPacketSig',
            },
            activeRevision: {
                uid: 'volumeId~linkId~revisionId',
                state: 'active',
                creationTime: new Date(1234567890000),
                storageSize: 12,
                signatureEmail: 'revSigEmail',
                armoredExtendedAttributes: '{file}',
                thumbnails: [],
            },
            ...encryptedCryptoOverrides,
        },
        ...overrides,
    };
}

function generateFolderNode(overrides = {}, encryptedCryptoOverrides = {}) {
    const node = generateNode();
    return {
        ...node,
        type: NodeType.Folder,
        encryptedCrypto: {
            ...node.encryptedCrypto,
            folder: {
                armoredHashKey: 'nodeHashKey',
                armoredExtendedAttributes: '{folder}',
            },
            ...encryptedCryptoOverrides,
        },
        ...overrides,
    };
}

function generateAlbumNode(overrides = {}) {
    const node = generateNode();
    return {
        ...node,
        type: NodeType.Album,
        ...overrides,
    };
}

function generateNode() {
    return {
        hash: 'nameHash',
        encryptedName: 'encName',

        uid: 'volumeId~linkId',
        parentUid: 'volumeId~parentLinkId',
        creationTime: new Date(123456789000),
        trashTime: undefined,

        shareId: undefined,
        isShared: false,
        isSharedPublicly: false,
        directRole: MemberRole.Admin,
        membership: undefined,

        encryptedCrypto: {
            armoredKey: 'nodeKey',
            armoredNodePassphrase: 'nodePass',
            armoredNodePassphraseSignature: 'nodePassSig',
            nameSignatureEmail: 'nameSigEmail',
            signatureEmail: 'sigEmail',
            membership: undefined,
        },
    };
}

describe('nodeAPIService', () => {
    let apiMock: DriveAPIService;
    let api: NodeAPIService;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error Mocking for testing purposes
        apiMock = {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
        };

        api = new NodeAPIService(getMockLogger(), apiMock);
    });

    describe('getNode', () => {
        it('should get node', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () =>
                Promise.resolve({
                    Links: [generateAPIFolderNode()],
                }),
            );

            const node = await api.getNode('volumeId~nodeId', 'volumeId');

            expect(node).toStrictEqual(generateFolderNode());
        });

        it('should throw error if node is not found', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () =>
                Promise.resolve({
                    Links: [],
                }),
            );

            const promise = api.getNode('volumeId~nodeId', 'volumeId');

            await expect(promise).rejects.toThrow('Node not found');
        });
    });

    describe('iterateNodes', () => {
        async function testIterateNodes(mockedLink: any, expectedNode: any, ownVolumeId = 'volumeId') {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () =>
                Promise.resolve({
                    Links: [mockedLink],
                }),
            );

            const nodes = await Array.fromAsync(api.iterateNodes(['volumeId~nodeId'], ownVolumeId));
            expect(nodes).toStrictEqual([expectedNode]);
        }

        it('should get folder node', async () => {
            await testIterateNodes(generateAPIFolderNode(), generateFolderNode());
        });

        it('should get root folder node', async () => {
            await testIterateNodes(
                generateAPIFolderNode({ ParentLinkID: null }),
                generateFolderNode({ parentUid: undefined }),
            );
        });

        it('should get file node', async () => {
            await testIterateNodes(generateAPIFileNode(), generateFileNode());
        });

        it('should get album node', async () => {
            await testIterateNodes(generateAPIAlbumNode(), generateAlbumNode());
        });

        it('should get shared node', async () => {
            await testIterateNodes(
                generateAPIFolderNode(
                    {},
                    {
                        Sharing: {
                            ShareID: 'shareId',
                        },
                        Membership: {
                            Permissions: 22,
                            InviteTime: 1234567890,
                            InviterEmail: 'inviterEmail',
                            MemberSharePassphraseKeyPacket: 'memberSharePassphraseKeyPacket',
                            InviterSharePassphraseKeyPacketSignature: 'inviterSharePassphraseKeyPacketSignature',
                            InviteeSharePassphraseSessionKeySignature: 'inviteeSharePassphraseSessionKeySignature',
                        },
                    },
                ),
                generateFolderNode(
                    {
                        isShared: true,
                        isSharedPublicly: false,
                        shareId: 'shareId',
                        directRole: MemberRole.Admin,
                        membership: {
                            role: MemberRole.Admin,
                            inviteTime: new Date(1234567890000),
                        },
                    },
                    {
                        membership: {
                            inviterEmail: 'inviterEmail',
                            base64MemberSharePassphraseKeyPacket: 'memberSharePassphraseKeyPacket',
                            armoredInviterSharePassphraseKeyPacketSignature: 'inviterSharePassphraseKeyPacketSignature',
                            armoredInviteeSharePassphraseSessionKeySignature:
                                'inviteeSharePassphraseSessionKeySignature',
                        },
                    },
                ),
            );
        });

        it('should get shared node with unknown permissions', async () => {
            await testIterateNodes(
                generateAPIFolderNode(
                    {},
                    {
                        Sharing: {
                            ShareID: 'shareId',
                        },
                        Membership: {
                            Permissions: 42,
                            InviteTime: 1234567890,
                            InviterEmail: 'inviterEmail',
                            MemberSharePassphraseKeyPacket: 'memberSharePassphraseKeyPacket',
                            InviterSharePassphraseKeyPacketSignature: 'inviterSharePassphraseKeyPacketSignature',
                            InviteeSharePassphraseSessionKeySignature: 'inviteeSharePassphraseSessionKeySignature',
                        },
                    },
                ),
                generateFolderNode(
                    {
                        isShared: true,
                        isSharedPublicly: false,
                        shareId: 'shareId',
                        directRole: MemberRole.Viewer,
                        membership: {
                            role: MemberRole.Viewer,
                            inviteTime: new Date(1234567890000),
                        },
                    },
                    {
                        membership: {
                            inviterEmail: 'inviterEmail',
                            base64MemberSharePassphraseKeyPacket: 'memberSharePassphraseKeyPacket',
                            armoredInviterSharePassphraseKeyPacketSignature: 'inviterSharePassphraseKeyPacketSignature',
                            armoredInviteeSharePassphraseSessionKeySignature:
                                'inviteeSharePassphraseSessionKeySignature',
                        },
                    },
                ),
                'myVolumeId',
            );
        });

        it('should get publicly shared node', async () => {
            await testIterateNodes(
                generateAPIFolderNode(
                    {},
                    {
                        Sharing: {
                            ShareID: 'shareId',
                            ShareURLID: 'shareUrlId',
                        },
                    },
                ),
                generateFolderNode({
                    isShared: true,
                    isSharedPublicly: true,
                    shareId: 'shareId',
                    directRole: MemberRole.Admin,
                }),
            );
        });

        it('should get trashed file node', async () => {
            await testIterateNodes(
                generateAPIFileNode({
                    TrashTime: 123456,
                }),
                generateFileNode({
                    trashTime: new Date(123456000),
                }),
            );
        });

        it('should get all recognised nodes before throwing error', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () =>
                Promise.resolve({
                    Links: [
                        generateAPIFolderNode(),
                        // Type 42 is not recognised - should throw error.
                        generateAPIFolderNode({ Type: 42 }),
                        // Type 43 is not recognised - should throw error.
                        generateAPIFileNode({ Type: 43 }),
                        generateAPIFileNode(),
                    ],
                }),
            );

            const generator = api.iterateNodes(['volumeId~nodeId'], 'volumeId');

            const node1 = await generator.next();
            expect(node1.value).toStrictEqual(generateFolderNode());

            // Second node is actually third, second is skipped and throwed at the end.
            const node2 = await generator.next();
            expect(node2.value).toStrictEqual(generateFileNode());

            const node3 = generator.next();
            await expect(node3).rejects.toThrow('Failed to load some nodes');
            try {
                await node3;
            } catch (error: any) {
                expect(error.cause).toEqual([new Error('Unknown node type: 42'), new Error('Unknown node type: 43')]);
            }
        });

        it('should get nodes across various volumes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async (url) =>
                Promise.resolve({
                    Links: [
                        generateAPIFolderNode({
                            LinkID: url.includes('volumeId1') ? 'nodeId1' : 'nodeId2',
                            ParentLinkID: url.includes('volumeId1') ? 'parentNodeId1' : 'parentNodeId2',
                        }),
                    ],
                }),
            );

            const nodes = await Array.fromAsync(
                api.iterateNodes(['volumeId1~nodeId1', 'volumeId2~nodeId2'], 'volumeId1'),
            );
            expect(nodes).toStrictEqual([
                generateFolderNode({
                    uid: 'volumeId1~nodeId1',
                    parentUid: 'volumeId1~parentNodeId1',
                    directRole: MemberRole.Admin,
                }),
                generateFolderNode({
                    uid: 'volumeId2~nodeId2',
                    parentUid: 'volumeId2~parentNodeId2',
                    directRole: MemberRole.Inherited,
                }),
            ]);
        });

        it('should get nodes in batches', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async (_, { LinkIDs }) =>
                Promise.resolve({
                    Links: LinkIDs.map((linkId: string) => generateAPIFolderNode({ LinkID: linkId })),
                }),
            );

            const nodeUids = Array.from({ length: 250 }, (_, i) => `volumeId1~nodeId${i}`);
            const nodeIds = nodeUids.map((uid) => uid.split('~')[1]);

            const nodes = await Array.fromAsync(api.iterateNodes(nodeUids, 'volumeId1'));
            expect(nodes).toHaveLength(nodeUids.length);

            expect(apiMock.post).toHaveBeenCalledTimes(3);
            expect(apiMock.post).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId1/links',
                { LinkIDs: nodeIds.slice(0, 100) },
                undefined,
            );
            expect(apiMock.post).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId1/links',
                { LinkIDs: nodeIds.slice(100, 200) },
                undefined,
            );
            expect(apiMock.post).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId1/links',
                { LinkIDs: nodeIds.slice(200, 250) },
                undefined,
            );
        });
    });

    describe('trashNodes', () => {
        it('should trash nodes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () =>
                Promise.resolve({
                    Responses: [
                        {
                            LinkID: 'nodeId1',
                            Response: {
                                Code: ErrorCode.OK,
                            },
                        },
                        {
                            LinkID: 'nodeId2',
                            Response: {
                                Code: 2027,
                                Error: 'INSUFFICIENT_SCOPE',
                            },
                        },
                    ],
                }),
            );

            const result = await Array.fromAsync(api.trashNodes(['volumeId~nodeId1', 'volumeId~nodeId2']));
            expect(result).toEqual([
                { uid: 'volumeId~nodeId1', ok: true },
                { uid: 'volumeId~nodeId2', ok: false, error: 'INSUFFICIENT_SCOPE' },
            ]);
        });

        it('should trash nodes in batches', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async (_, { LinkIDs }) =>
                Promise.resolve({
                    Responses: LinkIDs.map((linkId: string) => ({
                        LinkID: linkId,
                        Response: {
                            Code: ErrorCode.OK,
                        },
                    })),
                }),
            );

            const nodeUids = Array.from({ length: 250 }, (_, i) => `volumeId1~nodeId${i}`);
            const nodeIds = nodeUids.map((uid) => uid.split('~')[1]);

            const results = await Array.fromAsync(api.trashNodes(nodeUids));
            expect(results).toHaveLength(nodeUids.length);
            expect(results.every((result) => result.ok)).toBe(true);

            expect(apiMock.post).toHaveBeenCalledTimes(3);
            expect(apiMock.post).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId1/trash_multiple',
                { LinkIDs: nodeIds.slice(0, 100) },
                undefined,
            );
            expect(apiMock.post).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId1/trash_multiple',
                { LinkIDs: nodeIds.slice(100, 200) },
                undefined,
            );
            expect(apiMock.post).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId1/trash_multiple',
                { LinkIDs: nodeIds.slice(200, 250) },
                undefined,
            );
        });
    });

    describe('restoreNodes', () => {
        it('should restore nodes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.put = jest.fn(async () =>
                Promise.resolve({
                    Responses: [
                        {
                            LinkID: 'nodeId1',
                            Response: {
                                Code: ErrorCode.OK,
                            },
                        },
                        {
                            LinkID: 'nodeId2',
                            Response: {
                                Code: 2027,
                                Error: 'INSUFFICIENT_SCOPE',
                            },
                        },
                        {
                            LinkID: 'nodeId3',
                            Response: {
                                Code: 2000,
                            },
                        },
                    ],
                }),
            );

            const result = await Array.fromAsync(
                api.restoreNodes(['volumeId~nodeId1', 'volumeId~nodeId2', 'volumeId~nodeId3']),
            );
            expect(result).toEqual([
                { uid: 'volumeId~nodeId1', ok: true },
                { uid: 'volumeId~nodeId2', ok: false, error: 'INSUFFICIENT_SCOPE' },
                { uid: 'volumeId~nodeId3', ok: false, error: 'Unknown error 2000' },
            ]);
        });

        it('should restore nodes from multiple volumes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.put = jest.fn(async (_, { LinkIDs }) =>
                Promise.resolve({
                    Responses: LinkIDs.map((linkId: string) => ({
                        LinkID: linkId,
                        Response: {
                            Code: ErrorCode.OK,
                        },
                    })),
                }),
            );

            const result = await Array.fromAsync(api.restoreNodes(['volumeId1~nodeId1', 'volumeId2~nodeId2']));
            expect(result).toEqual([
                { uid: 'volumeId1~nodeId1', ok: true },
                { uid: 'volumeId2~nodeId2', ok: true },
            ]);
        });
    });

    describe('deleteNodes', () => {
        it('should delete nodes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () =>
                Promise.resolve({
                    Responses: [
                        {
                            LinkID: 'nodeId1',
                            Response: {
                                Code: ErrorCode.OK,
                            },
                        },
                        {
                            LinkID: 'nodeId2',
                            Response: {
                                Code: 2027,
                                Error: 'INSUFFICIENT_SCOPE',
                            },
                        },
                    ],
                }),
            );

            const result = await Array.fromAsync(api.deleteNodes(['volumeId~nodeId1', 'volumeId~nodeId2']));
            expect(result).toEqual([
                { uid: 'volumeId~nodeId1', ok: true },
                { uid: 'volumeId~nodeId2', ok: false, error: 'INSUFFICIENT_SCOPE' },
            ]);
        });

        it('should delete nodes from multiple volumes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async (_, { LinkIDs }) =>
                Promise.resolve({
                    Responses: LinkIDs.map((linkId: string) => ({
                        LinkID: linkId,
                        Response: {
                            Code: ErrorCode.OK,
                        },
                    })),
                }),
            );

            const result = await Array.fromAsync(api.deleteNodes(['volumeId1~nodeId1', 'volumeId2~nodeId2']));
            expect(result).toEqual([
                { uid: 'volumeId1~nodeId1', ok: true },
                { uid: 'volumeId2~nodeId2', ok: true },
            ]);
        });
    });

    describe('renameNode', () => {
        it('should rename node', async () => {
            await api.renameNode(
                'volumeId~nodeId1',
                { hash: 'originalHash' },
                { encryptedName: 'encryptedName1', nameSignatureEmail: 'nameSignatureEmail1', hash: 'newHash' },
            );

            expect(apiMock.put).toHaveBeenCalledWith(
                'drive/v2/volumes/volumeId/links/nodeId1/rename',
                {
                    Name: 'encryptedName1',
                    NameSignatureEmail: 'nameSignatureEmail1',
                    Hash: 'newHash',
                    OriginalHash: 'originalHash',
                },
                undefined,
            );
        });

        it('should throw error if node is out of sync', async () => {
            apiMock.put = jest.fn().mockRejectedValue(new InvalidRequirementsAPIError('Node is out of sync'));

            await expect(
                api.renameNode(
                    'volumeId~nodeId1',
                    { hash: 'originalHash' },
                    { encryptedName: 'encryptedName1', nameSignatureEmail: 'nameSignatureEmail1', hash: 'newHash' },
                ),
            ).rejects.toThrow(new NodeOutOfSyncError('Node is out of sync'));
        });
    });
});

describe('groupNodeUidsByVolumeAndIteratePerBatch', () => {
    it('should handle empty array', () => {
        const result = Array.from(groupNodeUidsByVolumeAndIteratePerBatch([]));
        expect(result).toEqual([]);
    });

    it('should handle single volume with nodes that fit in one batch', () => {
        const nodeUids = ['volumeId1~nodeId1', 'volumeId1~nodeId2', 'volumeId1~nodeId3'];

        const result = Array.from(groupNodeUidsByVolumeAndIteratePerBatch(nodeUids));

        expect(result).toEqual([
            {
                volumeId: 'volumeId1',
                batchNodeIds: ['nodeId1', 'nodeId2', 'nodeId3'],
                batchNodeUids: ['volumeId1~nodeId1', 'volumeId1~nodeId2', 'volumeId1~nodeId3'],
            },
        ]);
    });

    it('should handle single volume with nodes that require multiple batches', () => {
        // Create 250 node UIDs to test batching (API_NODES_BATCH_SIZE = 100)
        const nodeUids = Array.from({ length: 250 }, (_, i) => `volumeId1~nodeId${i}`);

        const result = Array.from(groupNodeUidsByVolumeAndIteratePerBatch(nodeUids));

        expect(result).toHaveLength(3); // 100 + 100 + 50

        // First batch
        expect(result[0]).toEqual({
            volumeId: 'volumeId1',
            batchNodeIds: Array.from({ length: 100 }, (_, i) => `nodeId${i}`),
            batchNodeUids: Array.from({ length: 100 }, (_, i) => `volumeId1~nodeId${i}`),
        });

        // Second batch
        expect(result[1]).toEqual({
            volumeId: 'volumeId1',
            batchNodeIds: Array.from({ length: 100 }, (_, i) => `nodeId${i + 100}`),
            batchNodeUids: Array.from({ length: 100 }, (_, i) => `volumeId1~nodeId${i + 100}`),
        });

        // Third batch
        expect(result[2]).toEqual({
            volumeId: 'volumeId1',
            batchNodeIds: Array.from({ length: 50 }, (_, i) => `nodeId${i + 200}`),
            batchNodeUids: Array.from({ length: 50 }, (_, i) => `volumeId1~nodeId${i + 200}`),
        });
    });

    it('should handle multiple volumes with nodes distributed across them', () => {
        const nodeUids = [
            'volumeId1~nodeId1',
            'volumeId2~nodeId2',
            'volumeId1~nodeId3',
            'volumeId3~nodeId4',
            'volumeId2~nodeId5',
        ];

        const result = Array.from(groupNodeUidsByVolumeAndIteratePerBatch(nodeUids));

        expect(result).toHaveLength(3); // One batch per volume

        // Results should be grouped by volume
        const volumeId1Batch = result.find((batch) => batch.volumeId === 'volumeId1');
        const volumeId2Batch = result.find((batch) => batch.volumeId === 'volumeId2');
        const volumeId3Batch = result.find((batch) => batch.volumeId === 'volumeId3');

        expect(volumeId1Batch).toEqual({
            volumeId: 'volumeId1',
            batchNodeIds: ['nodeId1', 'nodeId3'],
            batchNodeUids: ['volumeId1~nodeId1', 'volumeId1~nodeId3'],
        });

        expect(volumeId2Batch).toEqual({
            volumeId: 'volumeId2',
            batchNodeIds: ['nodeId2', 'nodeId5'],
            batchNodeUids: ['volumeId2~nodeId2', 'volumeId2~nodeId5'],
        });

        expect(volumeId3Batch).toEqual({
            volumeId: 'volumeId3',
            batchNodeIds: ['nodeId4'],
            batchNodeUids: ['volumeId3~nodeId4'],
        });
    });

    it('should handle multiple volumes where some require multiple batches', () => {
        // Volume 1: 150 nodes (2 batches)
        // Volume 2: 50 nodes (1 batch)
        // Volume 3: 200 nodes (2 batches)
        const volume1Nodes = Array.from({ length: 150 }, (_, i) => `volumeId1~nodeId${i}`);
        const volume2Nodes = Array.from({ length: 50 }, (_, i) => `volumeId2~nodeId${i}`);
        const volume3Nodes = Array.from({ length: 200 }, (_, i) => `volumeId3~nodeId${i}`);

        const nodeUids = [...volume1Nodes, ...volume2Nodes, ...volume3Nodes];

        const result = Array.from(groupNodeUidsByVolumeAndIteratePerBatch(nodeUids));

        expect(result).toHaveLength(5); // 2 + 1 + 2 batches

        // Group results by volume
        const volume1Batches = result.filter((batch) => batch.volumeId === 'volumeId1');
        const volume2Batches = result.filter((batch) => batch.volumeId === 'volumeId2');
        const volume3Batches = result.filter((batch) => batch.volumeId === 'volumeId3');

        expect(volume1Batches).toHaveLength(2);
        expect(volume2Batches).toHaveLength(1);
        expect(volume3Batches).toHaveLength(2);

        // Verify volume 1 batches
        expect(volume1Batches[0].batchNodeIds).toHaveLength(100);
        expect(volume1Batches[1].batchNodeIds).toHaveLength(50);

        // Verify volume 2 batch
        expect(volume2Batches[0].batchNodeIds).toHaveLength(50);

        // Verify volume 3 batches
        expect(volume3Batches[0].batchNodeIds).toHaveLength(100);
        expect(volume3Batches[1].batchNodeIds).toHaveLength(100);
    });
});
