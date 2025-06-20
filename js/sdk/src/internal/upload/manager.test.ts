import { ValidationError } from "../../errors";
import { NodeType, ProtonDriveTelemetry, RevisionState, UploadMetadata } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { ErrorCode } from "../apiService";
import { UploadAPIService } from "./apiService";
import { UploadCryptoService } from "./cryptoService";
import { NodesService, NodesEvents } from "./interface";
import { UploadManager } from './manager';

describe("UploadManager", () => {
    let telemetry: ProtonDriveTelemetry;
    let apiService: UploadAPIService;
    let cryptoService: UploadCryptoService;
    let nodesService: NodesService;
    let nodesEvents: NodesEvents;

    let manager: UploadManager;

    beforeEach(() => {
        telemetry = getMockTelemetry();
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            createDraft: jest.fn().mockResolvedValue({
                nodeUid: "newNode:nodeUid",
                nodeRevisionUid: "newNode:nodeRevisionUid",
            }),
            deleteDraft: jest.fn(),
            checkAvailableHashes: jest.fn().mockResolvedValue({
                availalbleHashes: ["name1Hash"],
                pendingHashes: [],
            }),
            commitDraftRevision: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            generateFileCrypto: jest.fn().mockResolvedValue({
                nodeKeys: {
                    decrypted: { key: 'newNode:key' },
                    encrypted: {
                        armoredKey: 'newNode:armoredKey',
                        armoredPassphrase: 'newNode:armoredPassphrase',
                        armoredPassphraseSignature: 'newNode:armoredPassphraseSignature',
                    },
                },
                contentKey: {
                    decrypted: { contentKeyPacketSessionKey: 'newNode:ContentKeyPacketSessionKey' },
                    encrypted: {
                        base64ContentKeyPacket: 'newNode:base64ContentKeyPacket',
                        armoredContentKeyPacketSignature: 'newNode:armoredContentKeyPacketSignature',
                    },
                },
                encryptedNode: {
                    encryptedName: "newNode:encryptedName",
                    hash: "newNode:hash",
                },
                signatureAddress: {
                    email: "signatureEmail",
                },
            }),
            generateNameHashes: jest.fn().mockResolvedValue([{
                name: "name1",
                hash: "name1Hash",
            }, {
                name: "name2",
                hash: "name2Hash",
            }, {
                name: "name3",
                hash: "name3Hash",
            }]),
            commitFile: jest.fn().mockResolvedValue({
                armoredManifestSignature: "newNode:armoredManifestSignature",
                signatureEmail: "signatureEmail",
                armoredExtendedAttributes: "newNode:armoredExtendedAttributes",
            }),
        }
        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {
            getNodeKeys: jest.fn().mockResolvedValue({
                hashKey: 'parentNode:hashKey',
                key: 'parentNode:nodekey',
            }),
            getRootNodeEmailKey: jest.fn().mockResolvedValue({
                email: "signatureEmail",
                addressId: "addressId",
            }),
        }
        nodesEvents = {
            nodeCreated: jest.fn(),
            nodeUpdated: jest.fn(),
        }

        manager = new UploadManager(telemetry, apiService, cryptoService, nodesService, nodesEvents);
    });

    describe("createDraftNode", () => {
        it("should fail to create node in non-folder parent", async () => {
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({ hashKey: undefined });

            const result = manager.createDraftNode("parentUid", "name", {} as UploadMetadata);
            await expect(result).rejects.toThrow("Creating files in non-folders is not allowed");
        });

        it("should create draft node", async () => {
            const result = await manager.createDraftNode("parentUid", "name", {
                mediaType: "myMimeType",
                expectedSize: 123456,
            } as UploadMetadata);

            expect(result).toEqual({
                nodeUid: "newNode:nodeUid",
                nodeRevisionUid: "newNode:nodeRevisionUid",
                nodeKeys: {
                    key: "newNode:key",
                    contentKeyPacketSessionKey: "newNode:ContentKeyPacketSessionKey",
                    signatureAddress: {
                        email: "signatureEmail",
                    },
                },
                newNodeInfo: {
                    parentUid: "parentUid",
                    name: "name",
                    encryptedName: "newNode:encryptedName",
                    hash: "newNode:hash",
                },
            });
            expect(apiService.createDraft).toHaveBeenCalledWith("parentUid", {
                armoredEncryptedName: "newNode:encryptedName",
                hash: "newNode:hash",
                mediaType: "myMimeType",
                intendedUploadSize: 123456,
                armoredNodeKey: "newNode:armoredKey",
                armoredNodePassphrase: "newNode:armoredPassphrase",
                armoredNodePassphraseSignature: "newNode:armoredPassphraseSignature",
                base64ContentKeyPacket: "newNode:base64ContentKeyPacket",
                armoredContentKeyPacketSignature: "newNode:armoredContentKeyPacketSignature",
                signatureEmail: "signatureEmail",
            });
            expect(apiService.checkAvailableHashes).not.toHaveBeenCalled();
        });

        it("should handle existing draft by deleting and trying again", async () => {
            let hashChecked = false;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (!hashChecked) {
                    throw new ValidationError("Draft already exists", ErrorCode.ALREADY_EXISTS);
                }
                return {
                    nodeUid: "newNode:nodeUid",
                    nodeRevisionUid: "newNode:nodeRevisionUid",
                };
            });

            apiService.checkAvailableHashes = jest.fn().mockImplementation(() => {
                if (!hashChecked) {
                    hashChecked = true;
                    return {
                        availalbleHashes: ["name1Hash"],
                        pendingHashes: [{
                            hash: "newNode:hash",
                            nodeUid: "nodeUidToDelete"
                        }],
                    }
                }
                return {
                    availalbleHashes: ["name1Hash"],
                    pendingHashes: [],
                }
            });

            const result = await manager.createDraftNode("parentUid", "name", {} as UploadMetadata);

            expect(apiService.checkAvailableHashes).toHaveBeenCalledTimes(1);
            expect(apiService.deleteDraft).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                nodeUid: "newNode:nodeUid",
                nodeRevisionUid: "newNode:nodeRevisionUid",
                nodeKeys: {
                    key: "newNode:key",
                    contentKeyPacketSessionKey: "newNode:ContentKeyPacketSessionKey",
                    signatureAddress: {
                        email: "signatureEmail",
                    },
                },
                newNodeInfo: {
                    parentUid: "parentUid",
                    name: "name",
                    encryptedName: "newNode:encryptedName",
                    hash: "newNode:hash",
                },
            });
            expect(apiService.deleteDraft).toHaveBeenCalledWith("nodeUidToDelete");
        });

        it("should handle error when deleting existing draft", async () => {
            let hashChecked = false;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (!hashChecked) {
                    throw new ValidationError("Draft already exists", ErrorCode.ALREADY_EXISTS);
                }
                return {
                    nodeUid: "newNode:nodeUid",
                    nodeRevisionUid: "newNode:nodeRevisionUid",
                };
            });
            apiService.deleteDraft = jest.fn().mockImplementation(() => {
                throw new Error("Failed to delete draft");
            });

            apiService.checkAvailableHashes = jest.fn().mockImplementation(() => {
                if (!hashChecked) {
                    hashChecked = true;
                    return {
                        availalbleHashes: ["name1Hash"],
                        pendingHashes: [{
                            hash: "newNode:hash",
                            nodeUid: "nodeUidToDelete"
                        }],
                    }
                }
                return {
                    availalbleHashes: ["name1Hash"],
                    pendingHashes: [],
                }
            });

            const result = manager.createDraftNode("parentUid", "name", {} as UploadMetadata);

            await expect(result).rejects.toThrow("Draft already exists");
            expect(apiService.checkAvailableHashes).toHaveBeenCalledTimes(1);
            expect(apiService.deleteDraft).toHaveBeenCalledTimes(1);
        });

        it("should handle existing name by providing available name", async () => {
            let count = 0;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (count === 0) {
                    count++;
                    throw new ValidationError("Draft already exists", ErrorCode.ALREADY_EXISTS);
                }
                return {
                    nodeUid: "newNode:nodeUid",
                    nodeRevisionUid: "newNode:nodeRevisionUid",
                };
            });

            const result = manager.createDraftNode("parentUid", "name", {} as UploadMetadata);

            await expect(result).rejects.toThrow("Draft already exists");
            expect(apiService.checkAvailableHashes).toHaveBeenCalledTimes(1);

            try {
                await result;
            } catch (error: any) {
                expect(error.availableName).toBe("name1");
            }
        });

        it("should handle existing name by providing available name when there is too many conflicts", async () => {
            let hashChecked = false;
            apiService.createDraft = jest.fn().mockImplementation(() => {
                if (!hashChecked) {
                    throw new ValidationError("Draft already exists", ErrorCode.ALREADY_EXISTS);
                }
                return {
                    nodeUid: "newNode:nodeUid",
                    nodeRevisionUid: "newNode:nodeRevisionUid",
                };
            });

            apiService.checkAvailableHashes = jest.fn().mockImplementation(() => {
                if (!hashChecked) {
                    hashChecked = true;
                    return {
                        // First page has no available hashes
                        availalbleHashes: [],
                        pendingHashes: [],
                    }
                }
                return {
                    availalbleHashes: ["name3Hash"],
                    pendingHashes: [],
                }
            });

            const result = manager.createDraftNode("parentUid", "name", {} as UploadMetadata);

            await expect(result).rejects.toThrow("Draft already exists");
            expect(apiService.checkAvailableHashes).toHaveBeenCalledTimes(2);

            try {
                await result;
            } catch (error: any) {
                expect(error.availableName).toBe("name3");
            }
        });
    });

    describe("commit draft", () => {
        const nodeRevisionDraft = {
            nodeUid: "newNode:nodeUid",
            nodeRevisionUid: "newNode:nodeRevisionUid",
            nodeKeys: {
                key: {_idx: 32321},
                contentKeyPacketSessionKey: "newNode:contentKeyPacketSessionKey",
                signatureAddress: {
                    email: "signatureEmail",
                    addressId: "addressId",
                    addressKey: "addressKey",
                } as any,
            },
        };
        const manifest = new Uint8Array([1, 2, 3]);
        const metadata = {
            mediaType: "myMimeType",
            expectedSize: 123456,
        };
        const extendedAttributes = {
            modificationTime: new Date(),
            digests: {
                sha1: "sha1",
            }
        };

        it("should commit revision draft", async () => {
            await manager.commitDraft(
                nodeRevisionDraft as any,
                manifest,
                metadata,
                extendedAttributes,
                1234567,
            );

            expect(cryptoService.commitFile).toHaveBeenCalledWith(nodeRevisionDraft.nodeKeys, manifest, expect.anything());
            expect(apiService.commitDraftRevision).toHaveBeenCalledWith(nodeRevisionDraft.nodeRevisionUid, expect.anything());
            expect(nodesEvents.nodeUpdated).toHaveBeenCalledWith({
                uid: "newNode:nodeUid",
                activeRevision: {
                    ok: true,
                    value: {
                        uid: "newNode:nodeRevisionUid",
                        state: RevisionState.Active,
                        creationTime: expect.any(Date),
                        contentAuthor: { ok: true, value: "signatureEmail" },
                        storageSize: 1234567,
                        claimedSize: 123456,
                        claimedModificationTime: extendedAttributes.modificationTime,
                        claimedDigests: {
                            sha1: "sha1",
                        },
                    },
                },
            });
        })

        it("should commit node draft", async () => {
            const nodeRevisionDraftWithNewNodeInfo = {
                ...nodeRevisionDraft,
                newNodeInfo: {
                    parentUid: "parentUid",
                    name: "newNode:name",
                    encryptedName: "newNode:encryptedName",
                    hash: "newNode:hash",
                }
            }
            await manager.commitDraft(
                nodeRevisionDraftWithNewNodeInfo as any,
                manifest,
                metadata,
                extendedAttributes,
                1234567,
            );

            expect(cryptoService.commitFile).toHaveBeenCalledWith(nodeRevisionDraft.nodeKeys, manifest, expect.anything());
            expect(apiService.commitDraftRevision).toHaveBeenCalledWith(nodeRevisionDraft.nodeRevisionUid, expect.anything());
            expect(nodesEvents.nodeCreated).toHaveBeenCalledWith(expect.objectContaining({
                uid: "newNode:nodeUid",
                parentUid: "parentUid",
                type: NodeType.File,
                totalStorageSize: 1234567,
                activeRevision: {
                    ok: true,
                    value: expect.objectContaining({
                        uid: "newNode:nodeRevisionUid",
                        storageSize: 1234567,
                    }),
                },
            }));
        });
    });
});
