import { MemberRole, NodeType } from "../../interface";
import { DriveAPIService } from "../apiService";
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
            XAttr: '{}',
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
            XAttr: '{}',
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
                id: "revisionId",
                encryptedExtendedAttributes: "{}",
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
                encryptedExtendedAttributes: "{}",
            },
        },
        ...overrides
    }
}

function generateNode() {
    return {
        volumeId: "volumeId",
        hash: "nameHash",

        uid: "volume:volumeId;node:linkId",
        parentUid: "volume:volumeId;node:parentLinkId",
        createdDate: new Date(123456789),
        trashedDate: undefined,

        shareId: undefined,
        isShared: false,
        directMemberRole: MemberRole.Viewer,

        encryptedCrypto: {
            armoredKey: "nodeKey",
            armoredNodePassphrase: "nodePass",
            armoredNodePassphraseSignature: "nodePassSig",
            encryptedName: "encName",
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

            const nodes = await api.getNodes(['volume:volumeId;node:nodeId']);
            expect(nodes).toEqual([expectedNode]);
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
    });

    describe('trashNodes', () => {
        it('should trash nodes', async () => {
            // @ts-expect-error Mocking for testing purposes
            apiMock.post = jest.fn(async () => Promise.resolve({
                Responses: [
                    {
                        LinkID: 'nodeId1',
                        Response: {
                            Code: 1000,
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

            const parentUid = 'volume:volumeId;node:parentLinkId';
            const result = await Array.fromAsync(api.trashNodes(parentUid, ['volume:volumeId;node:nodeId1', 'volume:volumeId;node:nodeId2']));
            expect(result).toEqual([
                { uid: 'volume:volumeId;node:nodeId1', ok: true },
                { uid: 'volume:volumeId;node:nodeId2', ok: false, error: 'INSUFFICIENT_SCOPE' },
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
                            Code: 1000,
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

            const result = await Array.fromAsync(api.restoreNodes(['volume:volumeId;node:nodeId1', 'volume:volumeId;node:nodeId2', 'volume:volumeId;node:nodeId3']));
            expect(result).toEqual([
                { uid: 'volume:volumeId;node:nodeId1', ok: true },
                { uid: 'volume:volumeId;node:nodeId2', ok: false, error: 'INSUFFICIENT_SCOPE' },
                { uid: 'volume:volumeId;node:nodeId3', ok: false, error: 'Unknown error' },
            ]);
        });

        it('should fail restoring from multiple volumes', async () => {  
            try {
                await Array.fromAsync(api.restoreNodes(['volume:volumeId1;node:nodeId1', 'volume:volumeId2;node:nodeId2']));
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
                            Code: 1000,
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

            const result = await Array.fromAsync(api.deleteNodes(['volume:volumeId;node:nodeId1', 'volume:volumeId;node:nodeId2']));
            expect(result).toEqual([
                { uid: 'volume:volumeId;node:nodeId1', ok: true },
                { uid: 'volume:volumeId;node:nodeId2', ok: false, error: 'INSUFFICIENT_SCOPE' },
            ]);
        });

        it('should fail deleting nodes from multiple volumes', async () => {  
            try {
                await Array.fromAsync(api.deleteNodes(['volume:volumeId1;node:nodeId1', 'volume:volumeId2;node:nodeId2']));
                throw new Error('Should have thrown');
            } catch (error: any) {
                expect(error.message).toEqual('deleteNodes does not support multiple volumes');
            }
        });
    });
});
