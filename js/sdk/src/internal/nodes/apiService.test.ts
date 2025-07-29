import { MemberRole, NodeType } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { DriveAPIService, ErrorCode } from '../apiService';
import { NodeAPIService } from './apiService';

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

function generateFileNode(overrides = {}) {
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
        },
        ...overrides,
    };
}

function generateFolderNode(overrides = {}) {
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
        directMemberRole: MemberRole.Admin,

        encryptedCrypto: {
            armoredKey: 'nodeKey',
            armoredNodePassphrase: 'nodePass',
            armoredNodePassphraseSignature: 'nodePassSig',
            nameSignatureEmail: 'nameSigEmail',
            signatureEmail: 'sigEmail',
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
                        },
                    },
                ),
                generateFolderNode({
                    isShared: true,
                    shareId: 'shareId',
                    directMemberRole: MemberRole.Admin,
                }),
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
                        },
                    },
                ),
                generateFolderNode({
                    isShared: true,
                    shareId: 'shareId',
                    directMemberRole: MemberRole.Viewer,
                }),
                'myVolumeId',
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
                    directMemberRole: MemberRole.Admin,
                }),
                generateFolderNode({
                    uid: 'volumeId2~nodeId2',
                    parentUid: 'volumeId2~parentNodeId2',
                    directMemberRole: MemberRole.Inherited,
                }),
            ]);
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

        it('should fail restoring from multiple volumes', async () => {
            try {
                await Array.fromAsync(api.restoreNodes(['volumeId1~nodeId1', 'volumeId2~nodeId2']));
                throw new Error('Should have thrown');
            } catch (error: any) {
                expect(error.message).toEqual('Restoring items from multiple sections is not allowed');
            }
        });
    });

    describe('deleteNOdes', () => {
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

        it('should fail deleting nodes from multiple volumes', async () => {
            try {
                await Array.fromAsync(api.deleteNodes(['volumeId1~nodeId1', 'volumeId2~nodeId2']));
                throw new Error('Should have thrown');
            } catch (error: any) {
                expect(error.message).toEqual('Deleting items from multiple sections is not allowed');
            }
        });
    });
});
