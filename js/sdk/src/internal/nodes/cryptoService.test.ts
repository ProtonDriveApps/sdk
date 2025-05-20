import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from "../../crypto";
import { ProtonDriveAccount, ProtonDriveTelemetry, RevisionState } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { DecryptedNodeKeys, DecryptedUnparsedNode, EncryptedNode, SharesService } from "./interface";
import { NodesCryptoService } from "./cryptoService";

describe("nodesCryptoService", () => {
    let telemetry: ProtonDriveTelemetry;
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;

    let cryptoService: NodesCryptoService;

    beforeEach(() => {
        jest.clearAllMocks();

        telemetry = getMockTelemetry();
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {
            decryptKey: jest.fn(async () => Promise.resolve({
                passphrase: "pass",
                key: "decryptedKey" as unknown as PrivateKey,
                passphraseSessionKey: "passphraseSessionKey" as unknown as SessionKey,
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            })),
            decryptNodeName: jest.fn(async () => Promise.resolve({
                name: "name",
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            })),
            decryptNodeHashKey: jest.fn(async () => Promise.resolve({
                hashKey: new Uint8Array(),
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            })),
            decryptExtendedAttributes: jest.fn(async () => Promise.resolve({
                extendedAttributes: "{}",
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            })),
            encryptNodeName: jest.fn(async () => Promise.resolve({
                armoredNodeName: "armoredName",
            })),
            decryptAndVerifySessionKey: jest.fn(async () => Promise.resolve({
                sessionKey: "contentKeyPacketSessionKey",
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            })),
        };
        // @ts-expect-error No need to implement all methods for mocking
        account = {
            getPublicKeys: jest.fn(async () => []),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getVolumeEmailKey: jest.fn(async () => ({
                email: "email",
                addressKey: "key" as unknown as PrivateKey,
            })),
            getVolumeMetricContext: jest.fn().mockResolvedValue('own_volume'),
        };

        cryptoService = new NodesCryptoService(telemetry, driveCrypto, account, sharesService);
    });

    const parentKey = "parentKey" as unknown as PrivateKey;

    function verifyLogEventVerificationError(options = {}) {
        expect(telemetry.logEvent).toHaveBeenCalledTimes(1);
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "verificationError",
            context: "own_volume",
            fromBefore2024: false,
            addressMatchingDefaultShare: false,
            ...options,
        });
    }

    function verifyLogEventDecryptionError(options = {}) {
        expect(telemetry.logEvent).toHaveBeenCalledTimes(1);
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "decryptionError",
            context: "own_volume",
            fromBefore2024: false,
            ...options,
        });
    }

    describe("folder node", () => {
        const encryptedNode = {
            uid: "volumeId~nodeId",
            encryptedCrypto: {
                signatureEmail: "signatureEmail",
                nameSignatureEmail: "nameSignatureEmail",
                armoredKey: "armoredKey",
                armoredNodePassphrase: "armoredNodePassphrase",
                armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                folder: {
                    armoredHashKey: "armoredHashKey",
                    armoredExtendedAttributes: "folderArmoredExtendedAttributes",
                },
            },
        } as EncryptedNode;

        function verifyResult(
            result: { node: DecryptedUnparsedNode, keys?: DecryptedNodeKeys },
            expectedNode: Partial<DecryptedUnparsedNode> = {},
            expectedKeys: Partial<DecryptedNodeKeys> | 'noKeys' = {},
        ) {
            expect(result).toMatchObject({
                node: {
                    name: { ok: true, value: "name" },
                    keyAuthor: { ok: true, value: "signatureEmail" },
                    nameAuthor: { ok: true, value: "nameSignatureEmail" },
                    folder: {
                        extendedAttributes: "{}",
                    },
                    activeRevision: undefined,
                    errors: undefined,
                    ...expectedNode,
                },
                ...expectedKeys === 'noKeys' ? {} : {
                    keys: {
                        passphrase: "pass",
                        key: "decryptedKey",
                        passphraseSessionKey: "passphraseSessionKey",
                        hashKey: new Uint8Array(),
                        ...expectedKeys,
                    }
                },
            });
        }

        describe("should decrypt successfuly", () => {
            it("same author everywhere", async () => {
                const encryptedNode = {
                    encryptedCrypto: {
                        signatureEmail: "signatureEmail",
                        nameSignatureEmail: "signatureEmail",
                        armoredKey: "armoredKey",
                        armoredNodePassphrase: "armoredNodePassphrase",
                        armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                        folder: {
                            armoredHashKey: "armoredHashKey",
                            armoredExtendedAttributes: "folderArmoredExtendedAttributes",
                        },
                    },
                } as EncryptedNode;

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: true, value: "signatureEmail" },
                    nameAuthor: { ok: true, value: "signatureEmail" },
                });

                expect(account.getPublicKeys).toHaveBeenCalledTimes(1);
                expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
                expect(telemetry.logEvent).not.toHaveBeenCalled();
            });

            it("different authors on key and name", async () => {
                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result);
                expect(account.getPublicKeys).toHaveBeenCalledTimes(2);
                expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
                expect(account.getPublicKeys).toHaveBeenCalledWith("nameSignatureEmail");
                expect(telemetry.logEvent).not.toHaveBeenCalled();
            });
        });

        describe("should decrypt with verification issues", () => {
            it("on node key", async () => {
                driveCrypto.decryptKey = jest.fn(async () => Promise.resolve({
                    passphrase: "pass",
                    key: "decryptedKey" as unknown as PrivateKey,
                    passphraseSessionKey: "passphraseSessionKey" as unknown as SessionKey,
                    verified: VERIFICATION_STATUS.NOT_SIGNED,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing signature for key" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeKey',
                });
            });

            it("on node name", async () => {
                driveCrypto.decryptNodeName = jest.fn(async () => Promise.resolve({
                    name: "name",
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Signature verification for name failed" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                });
            });

            it("on hash key", async () => {
                driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.resolve({
                    hashKey: new Uint8Array(),
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Signature verification for hash key failed" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeHashKey',
                });
            });

            it("on node key and hash key reports error from node key", async () => {
                driveCrypto.decryptKey = jest.fn(async () => Promise.resolve({
                    passphrase: "pass",
                    key: "decryptedKey" as unknown as PrivateKey,
                    passphraseSessionKey: "passphraseSessionKey" as unknown as SessionKey,
                    verified: VERIFICATION_STATUS.NOT_SIGNED,
                }));
                driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.resolve({
                    hashKey: new Uint8Array(),
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing signature for key" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeKey',
                });
            });

            it("on folder extended attributes", async () => {
                driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.resolve({
                    extendedAttributes: "{}",
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Signature verification for attributes failed" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeExtendedAttributes',
                });
            });
        });

        describe("should decrypt with decryption issues", () => {
            it("on node key", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Failed to decrypt node key: Decryption error" } },
                    errors: [new Error("Decryption error")],
                    folder: undefined,
                }, 'noKeys');
                verifyLogEventDecryptionError({
                    field: 'nodeKey',
                    error,
                });
            });

            it("on node name", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptNodeName = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    name: { ok: false, error },
                    nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Decryption error" } },
                }, 'noKeys');
                verifyLogEventDecryptionError({
                    field: 'nodeName',
                    error,
                });
            });

            it("on hash key", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    errors: [error],
                }, 'noKeys');
                verifyLogEventDecryptionError({
                    field: 'nodeHashKey',
                    error,
                });
            });

            it("on folder extended attributes", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    folder: undefined,
                    errors: [error],
                }, 'noKeys');
                verifyLogEventDecryptionError({
                    field: 'nodeFolderExtendedAttributes',
                    error,
                });
            });
        });

        it("should fail when keys cannot be loaded", async () => {
            account.getPublicKeys = jest.fn().mockRejectedValue(new Error("Failed to load keys"));

            const result = cryptoService.decryptNode(encryptedNode, parentKey);
            await expect(result).rejects.toThrow("Failed to load keys");
        });
    });

    describe("file node", () => {
        const encryptedNode = {
            uid: "volumeId~nodeId",
            encryptedCrypto: {
                signatureEmail: "signatureEmail",
                nameSignatureEmail: "nameSignatureEmail",
                armoredKey: "armoredKey",
                armoredNodePassphrase: "armoredNodePassphrase",
                armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                file: {
                    base64ContentKeyPacket: "base64ContentKeyPacket",
                },
                activeRevision: {
                    uid: "revisionUid",
                    state: "active",
                    signatureEmail: "revisionSignatureEmail",
                    armoredExtendedAttributes: "encryptedExtendedAttributes",
                },
            },
        } as EncryptedNode;

        function verifyResult(
            result: { node: DecryptedUnparsedNode, keys?: DecryptedNodeKeys },
            expectedNode: Partial<DecryptedUnparsedNode> = {},
            expectedKeys: Partial<DecryptedNodeKeys> | 'noKeys' = {},
        ) {
            expect(result).toMatchObject({
                node: {
                    name: { ok: true, value: "name" },
                    keyAuthor: { ok: true, value: "signatureEmail" },
                    nameAuthor: { ok: true, value: "nameSignatureEmail" },
                    folder: undefined,
                    activeRevision: { ok: true, value: {
                        uid: "revisionUid",
                        state: RevisionState.Active,
                        creationTime: undefined,
                        extendedAttributes: "{}",
                        contentAuthor: { ok: true, value: "revisionSignatureEmail" },
                    } },
                    errors: undefined,
                    ...expectedNode,
                },
                ...expectedKeys === 'noKeys' ? {} : {
                    keys: {
                        passphrase: "pass",
                        key: "decryptedKey",
                        passphraseSessionKey: "passphraseSessionKey",
                        hashKey: undefined,
                        contentKeyPacketSessionKey: "contentKeyPacketSessionKey",
                        ...expectedKeys,
                    },
                },
            });
        }

        describe("should decrypt successfuly", () => {
            it("same author everywhere", async () => {
                const encryptedNode = {
                    encryptedCrypto: {
                        signatureEmail: "signatureEmail",
                        nameSignatureEmail: "signatureEmail",
                        armoredKey: "armoredKey",
                        armoredNodePassphrase: "armoredNodePassphrase",
                        armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                        file: {
                            base64ContentKeyPacket: "base64ContentKeyPacket",
                        },
                        activeRevision: {
                            uid: "revisionUid",
                            state: "active",
                            signatureEmail: "signatureEmail",
                            armoredExtendedAttributes: "encryptedExtendedAttributes",
                        },
                    },
                } as EncryptedNode;

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: true, value: "signatureEmail" },
                    nameAuthor: { ok: true, value: "signatureEmail" },
                    activeRevision: { ok: true, value: {
                        uid: "revisionUid",
                        state: RevisionState.Active,
                        // @ts-expect-error Ignore mocked data.
                        creationTime: undefined,
                        extendedAttributes: "{}",
                        contentAuthor: { ok: true, value: "signatureEmail" },
                    } },
                });

                expect(account.getPublicKeys).toHaveBeenCalledTimes(2); // node + revision
                expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
                expect(telemetry.logEvent).not.toHaveBeenCalled();
            });

            it("different authors on key and name", async () => {
                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result);
                expect(account.getPublicKeys).toHaveBeenCalledTimes(3);
                expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
                expect(account.getPublicKeys).toHaveBeenCalledWith("nameSignatureEmail");
                expect(account.getPublicKeys).toHaveBeenCalledWith("revisionSignatureEmail");
                expect(telemetry.logEvent).not.toHaveBeenCalled();
            });
        });

        describe("should decrypt with verification issues", () => {
            it("on node key", async () => {
                driveCrypto.decryptKey = jest.fn(async () => Promise.resolve({
                    passphrase: "pass",
                    key: "decryptedKey" as unknown as PrivateKey,
                    passphraseSessionKey: "passphraseSessionKey" as unknown as SessionKey,
                    verified: VERIFICATION_STATUS.NOT_SIGNED,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing signature for key" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeKey',
                });
            });

            it("on node name", async () => {
                driveCrypto.decryptNodeName = jest.fn(async () => Promise.resolve({
                    name: "name",
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Signature verification for name failed" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeName',
                });
            });

            it("on folder extended attributes", async () => {
                driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.resolve({
                    extendedAttributes: "{}",
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    activeRevision: { ok: true, value: {
                        uid: "revisionUid",
                        extendedAttributes: "{}",
                        state: RevisionState.Active,
                        // @ts-expect-error Ignore mocked data.
                        creationTime: undefined,
                        contentAuthor: { ok: false, error: { claimedAuthor: "revisionSignatureEmail", error: "Signature verification for attributes failed" } },
                    } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeExtendedAttributes',
                });
            });

            it("on content key packet", async () => {
                driveCrypto.decryptAndVerifySessionKey = jest.fn(async () => Promise.resolve({
                    sessionKey: "contentKeyPacketSessionKey",
                    verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
                }));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Signature verification for content key failed" } },
                });
                verifyLogEventVerificationError({
                    field: 'nodeContentKey',
                });
            });
        });

        describe("should decrypt with decryption issues", () => {
            it("on node key", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Failed to decrypt node key: Decryption error" } },
                    activeRevision: { ok: false, error: new Error('Failed to decrypt node key: Decryption error') },
                    errors: [new Error("Decryption error")],
                    folder: undefined,
                }, 'noKeys');
                verifyLogEventDecryptionError({
                    field: 'nodeKey',
                    error,
                });
            });

            it("on node name", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptNodeName = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    name: { ok: false, error },
                    nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Decryption error" } },
                }, 'noKeys');
                verifyLogEventDecryptionError({
                    field: 'nodeName',
                    error,
                });
            });

            it("on file extended attributes", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    activeRevision: { ok: false, error: new Error('Failed to decrypt active revision: Decryption error') },
                });
                verifyLogEventDecryptionError({
                    field: 'nodeActiveRevision',
                    error,
                });
            });

            it("on content key packet", async () => {
                const error = new Error("Decryption error");
                driveCrypto.decryptAndVerifySessionKey = jest.fn(async () => Promise.reject(error));

                const result = await cryptoService.decryptNode(encryptedNode, parentKey);
                verifyResult(result, {
                    keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: 'Failed to decrypt content key: Decryption error' } },
                    errors: [error],
                }, {
                    contentKeyPacketSessionKey: undefined,
                });
                verifyLogEventDecryptionError({
                    field: 'nodeContentKey',
                    error,
                });
            });
        });

        it("should fail when keys cannot be loaded", async () => {
            account.getPublicKeys = jest.fn().mockRejectedValue(new Error("Failed to load keys"));

            const result = cryptoService.decryptNode(encryptedNode, parentKey);
            await expect(result).rejects.toThrow("Failed to load keys");
        });
    });
});
