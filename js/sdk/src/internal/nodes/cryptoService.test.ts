import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from "../../crypto";
import { ProtonDriveAccount, ProtonDriveTelemetry } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { EncryptedNode, SharesService } from "./interface";
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
                sessionKey: "sessionKey" as unknown as SessionKey,
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
        };

        cryptoService = new NodesCryptoService(telemetry, driveCrypto, account, sharesService);
    });

    it("should decrypt node with same author everywhere", async () => {
        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId:nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "signatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "signatureEmail" },
                activeRevision: undefined,
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: undefined,
            },
        });

        expect(account.getPublicKeys).toHaveBeenCalledTimes(1);
        expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should decrypt node with different authors", async () => {
        const result = await cryptoService.decryptNode(
            {
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toEqual({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: undefined,
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: undefined,
            },
        });

        expect(account.getPublicKeys).toHaveBeenCalledTimes(2);
        expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
        expect(account.getPublicKeys).toHaveBeenCalledWith("nameSignatureEmail");
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should decrypt folder node", async () => {
        const result = await cryptoService.decryptNode(
            {
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "signatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                        armoredExtendedAttributes: "encryptedExtendedAttributes",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toEqual({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "signatureEmail" },
                activeRevision: undefined,
                folder: {
                    extendedAttributes: "{}",
                },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should decrypt folder node with signature validation error on key", async () => {
        driveCrypto.decryptKey = jest.fn(async () => Promise.resolve({
            passphrase: "pass",
            key: "decryptedKey" as unknown as PrivateKey,
            sessionKey: "sessionKey" as unknown as SessionKey,
            verified: VERIFICATION_STATUS.NOT_SIGNED,
        }));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing key signature" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: undefined,
                folder: {
                    extendedAttributes: undefined,
                },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "verificationError",
            context: "own_volume",
            fromBefore2024: false,
            verificationKey: "SignatureEmail",
            addressMatchingDefaultShare: false,
        });
    });

    it("should decrypt folder node with signature validation error on name", async () => {
        driveCrypto.decryptNodeName = jest.fn(async () => Promise.resolve({
            name: "name",
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Verification of name signature failed" } },
                activeRevision: undefined,
                folder: {
                    extendedAttributes: undefined,
                },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "verificationError",
            context: "own_volume",
            fromBefore2024: false,
            verificationKey: "NameSignatureEmail",
            addressMatchingDefaultShare: false,
        });
    });

    it("should decrypt folder node with signature validation error on hash key", async () => {
        driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.resolve({
            hashKey: new Uint8Array(),
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Verification of hash key signature failed" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: undefined,
                folder: {
                    extendedAttributes: undefined,
                },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "verificationError",
            context: "own_volume",
            fromBefore2024: false,
            verificationKey: "NodeKey",
            addressMatchingDefaultShare: false,
        });
    });

    it("should decrypt folder node with signature validation error on key and hash key", async () => {
        driveCrypto.decryptKey = jest.fn(async () => Promise.resolve({
            passphrase: "pass",
            key: "decryptedKey" as unknown as PrivateKey,
            sessionKey: "sessionKey" as unknown as SessionKey,
            verified: VERIFICATION_STATUS.NOT_SIGNED,
        }));
        driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.resolve({
            hashKey: new Uint8Array(),
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing key signature" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: undefined,
                folder: {
                    extendedAttributes: undefined,
                },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "verificationError",
            context: "own_volume",
            fromBefore2024: false,
            verificationKey: "SignatureEmail",
            addressMatchingDefaultShare: false,
        });
        expect(telemetry.logEvent).toHaveBeenCalledTimes(1);
    });

    it("should decrypt folder node with signature validation error on extended attributes", async () => {
        driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.resolve({
            extendedAttributes: "{}",
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                        armoredExtendedAttributes: "encryptedExtendedAttributes",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Verification of extended attributes signature failed" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: undefined,
                folder: {
                    extendedAttributes: "{}",
                },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should decrypt file node", async () => {
        const result = await cryptoService.decryptNode(
            {
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
                        signatureEmail: "revisionSignatureEmail",
                        armoredExtendedAttributes: "encryptedExtendedAttributes",
                    },
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toEqual({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "signatureEmail" },
                activeRevision: { ok: true, value: {
                    uid: "revisionUid",
                    state: "active",
                    createdDate: undefined,
                    extendedAttributes: "{}",
                    contentAuthor: { ok: true, value: "revisionSignatureEmail" },
                } },
                folder: undefined,
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: undefined,
            },
        });
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should decrypt file node with signature validation error on extended attribute", async () => {
        driveCrypto.decryptExtendedAttributes = jest.fn(async () => Promise.resolve({
            extendedAttributes: "{}",
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
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
                        signatureEmail: "revisionSignatureEmail",
                        armoredExtendedAttributes: "encryptedExtendedAttributes",
                    },
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toEqual({
            node: {
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "signatureEmail" },
                activeRevision: { ok: true, value: {
                    uid: "revisionUid",
                    state: "active",
                    createdDate: undefined,
                    extendedAttributes: "{}",
                    contentAuthor: { ok: false, error: { claimedAuthor: "revisionSignatureEmail", error: "Verification of extended attributes signature failed" } },
                } },
                folder: undefined,
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: undefined,
            },
        });
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should handle decrypt of node with key decryption issue", async () => {
        const error = new Error("Decryption error");
        driveCrypto.decryptKey = jest.fn(async () => Promise.reject(error));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                    folder: {
                        armoredHashKey: "armoredHashKey",
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: false, error: { name: "", error: "Failed to decrypt node key: Decryption error"} },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Failed to decrypt node key: Decryption error" } },
                nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Failed to decrypt node key: Decryption error" } },
                activeRevision: { ok: false, error: new Error("Failed to decrypt node key: Decryption error") },
            },
        });
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "decryptionError",
            context: "own_volume",
            entity: "node",
            fromBefore2024: false,
            error,
        });
    });

    it("should handle decrypt of node with name decryption issue", async () => {
        const error = new Error("Decryption error");
        driveCrypto.decryptNodeName = jest.fn(async () => Promise.reject(error));

        const result = await cryptoService.decryptNode(
            {
                uid: "volumeId~nodeId",
                encryptedCrypto: {
                    signatureEmail: "signatureEmail",
                    nameSignatureEmail: "nameSignatureEmail",
                    armoredKey: "armoredKey",
                    armoredNodePassphrase: "armoredNodePassphrase",
                    armoredNodePassphraseSignature: "armoredNodePassphraseSignature",
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toMatchObject({
            node: {
                name: { ok: false, error: { name: "", error: "Decryption error" } },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Decryption error" } },
                activeRevision: undefined,
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: undefined,
            },
        });
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: "decryptionError",
            context: "own_volume",
            entity: "node",
            fromBefore2024: false,
            error,
        });
    });
});
