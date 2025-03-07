import { MemberRole, NodeType } from "../../interface";
import { DriveAPIService, ErrorCode } from "../apiService";
import { NodeAPIService } from './apiService';

function generateAPIFileNode(linkOverrides = {}, overrides = {}) {
    const node = generateAPINode();
    return {
        Link: {
            ...node.Link,
            Type: 2,
            MIMEType: 'text',
            ...linkOverrides,
        },
        File: {
            ContentKeyPacket: 'contentKeyPacket',
            ContentKeyPacketSignature: 'contentKeyPacketSig',
        },
        ActiveRevision: {
            RevisionID: 'revisionId',
            CreateTime: 1234567890,
            SignatureEmail: 'revSigEmail',
            XAttr: '{file}',
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
            MIMEType: 'Folder',
            ...linkOverrides,
        },
        Folder: {
            XAttr: '{folder}',
            NodeHashKey: 'nodeHashKey',
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
        mimeType: "text",
        encryptedCrypto: {
            ...node.encryptedCrypto,
            file: {
                base64ContentKeyPacket: "contentKeyPacket",
                armoredContentKeyPacketSignature: "contentKeyPacketSig",
            },
            activeRevision: {
                uid: "volumeId~linkId~revisionId",
                state: "active",
                createdDate: new Date(1234567890000),
                signatureEmail: "revSigEmail",
                armoredExtendedAttributes: "{file}",
            },
        },
        ...overrides
    }
}

function generateFolderNode(overrides = {}) {
    const node = generateNode();
    return {
        ...node,
        type: NodeType.Folder,
        mimeType: "Folder",
        encryptedCrypto: {
            ...node.encryptedCrypto,
            folder: {
                armoredHashKey: "nodeHashKey",
                armoredExtendedAttributes: "{folder}",
            },
        },
        ...overrides
    }
}

function generateNode() {
    return {
        hash: "nameHash",
        encryptedName: "encName",

        uid: "volumeId~linkId",
        parentUid: "volumeId~parentLinkId",
        createdDate: new Date(123456789000),
        trashedDate: undefined,

        shareId: undefined,
        isShared: false,
        directMemberRole: MemberRole.Viewer,

        encryptedCrypto: {
            armoredKey: "nodeKey",
            armoredNodePassphrase: "nodePass",
            armoredNodePassphraseSignature: "nodePassSig",
            nameSignatureEmail: "nameSigEmail",
            signatureEmail: "sigEmail",
        },
    }
}

describe("nodeAPIService", () => {
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

        api = new NodeAPIService(apiMock);
    });

    describe('getNodes', () => {
        async function testGetNodes(mockedLink: any, expectedNode: any) {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () => Promise.resolve({
                Links: [mockedLink],
            }));

            const nodes = await api.getNodes(['volumeId~nodeId']);
            expect(nodes).toStrictEqual([expectedNode]);
        }
    
        it('should get folder node', async () => {
            await testGetNodes(
                generateAPIFolderNode(),
                generateFolderNode(),
            );
        });

        it('should get root folder node', async () => {
            await testGetNodes(
                generateAPIFolderNode({ ParentLinkID: null }),
                generateFolderNode({ parentUid: undefined }),
            );
        });
    
        it('should get file node', async () => {
            await testGetNodes(
                generateAPIFileNode(),
                generateFileNode(),
            );
        });

        it('should get shared node', async () => {
            await testGetNodes(
                generateAPIFolderNode({}, {
                    SharingSummary: {
                        ShareID: 'shareId',
                        ShareAccess: {
                            Permissions: 22,
                        },
                    }
                }),
                generateFolderNode({
                    isShared: true,
                    shareId: 'shareId',
                    directMemberRole: MemberRole.Admin,
                }),
            );
        });

        it('should get shared node with unknown permissions', async () => {
            await testGetNodes(
                generateAPIFolderNode({}, {
                    SharingSummary: {
                        ShareID: 'shareId',
                        ShareAccess: {
                            Permissions: 42,
                        },
                    }
                }),
                generateFolderNode({
                    isShared: true,
                    shareId: 'shareId',
                    directMemberRole: MemberRole.Viewer,
                }),
            );
        });

        it('should get trashed file node', async () => {
            await testGetNodes(
                generateAPIFileNode({
                    TrashTime: 123456,
                }),
                generateFileNode({
                    trashedDate: new Date(123456000)
                }),
            );
        });
    });

    describe('trashNodes', () => {
        it('should trash nodes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () => Promise.resolve({
                Responses: [
                    {
                        LinkID: 'nodeId1',
                        Response: {
                            Code: ErrorCode.OK,
                        }
                    },
                    {
                        LinkID: 'nodeId2',
                        Response: {
                            Code: 2027,
                            Error: 'INSUFFICIENT_SCOPE'
                        }
                    }
                ],
            }));

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
            apiMock.put = jest.fn(async () => Promise.resolve({
                Responses: [
                    {
                        LinkID: 'nodeId1',
                        Response: {
                            Code: ErrorCode.OK,
                        }
                    },
                    {
                        LinkID: 'nodeId2',
                        Response: {
                            Code: 2027,
                            Error: 'INSUFFICIENT_SCOPE'
                        }
                    },
                    {
                        LinkID: 'nodeId3',
                        Response: {
                            Code: 2000,
                        }
                    },
                ],
            }));

            const result = await Array.fromAsync(api.restoreNodes(['volumeId~nodeId1', 'volumeId~nodeId2', 'volumeId~nodeId3']));
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
                expect(error.message).toEqual('restoreNodes does not support multiple volumes');
            }
        });
    });

    describe('deleteNOdes', () => {
        it('should delete nodes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () => Promise.resolve({
                Responses: [
                    {
                        LinkID: 'nodeId1',
                        Response: {
                            Code: ErrorCode.OK,
                        }
                    },
                    {
                        LinkID: 'nodeId2',
                        Response: {
                            Code: 2027,
                            Error: 'INSUFFICIENT_SCOPE'
                        }
                    }
                ],
            }));

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
                expect(error.message).toEqual('deleteNodes does not support multiple volumes');
            }
        });
    });
});
