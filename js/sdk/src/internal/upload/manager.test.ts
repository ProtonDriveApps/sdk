import { ValidationError } from "../../errors";
import { ProtonDriveTelemetry, UploadMetadata } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { ErrorCode } from "../apiService";
import { UploadAPIService } from "./apiService";
import { UploadCryptoService } from "./cryptoService";
import { NodesService } from "./interface";
import { UploadManager } from './manager';

describe("UploadManager", () => {
    let telemetry: ProtonDriveTelemetry;
    let apiService: UploadAPIService;
    let cryptoService: UploadCryptoService;
    let nodesService: NodesService;

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
        }
        nodesService = {
            getNodeKeys: jest.fn().mockResolvedValue({
                hashKey: 'parentNode:hashKey',
                key: 'parentNode:nodekey',
            }),
        }

        manager = new UploadManager(telemetry, apiService, cryptoService, nodesService);
    });

    describe("createDraftNode", () => {
        it("should fail to create node in non-folder parent", async () => {
            nodesService.getNodeKeys = jest.fn().mockResolvedValue({ hashKey: undefined });

            const result = manager.createDraftNode("parentUid", "name", {} as UploadMetadata);
            await expect(result).rejects.toThrow("Creating folders in non-folders is not allowed");
        });

        it("should create draft node", async () => {
            const result = await manager.createDraftNode("parentUid", "name", {
                mimeType: "myMimeType",
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
            });
            expect(apiService.createDraft).toHaveBeenCalledWith("parentUid", {
                armoredEncryptedName: "newNode:encryptedName",
                hash: "newNode:hash",
                mimeType: "myMimeType",
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
});
