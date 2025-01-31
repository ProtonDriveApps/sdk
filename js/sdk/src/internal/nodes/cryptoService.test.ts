import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from "../../crypto";
import { ProtonDriveAccount } from "../../interface";
import { EncryptedNode, SharesService } from "./interface";
import { NodesCryptoService } from "./cryptoService";

describe("nodesCryptoService", () => {
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;

    let cryptoService: NodesCryptoService;

    beforeEach(() => {
        jest.clearAllMocks();

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
                key: "key" as unknown as PrivateKey,
            })),
        };

        cryptoService = new NodesCryptoService(driveCrypto, account, sharesService);
    });

    it("should decrypt node with same author everywhere", async () => {
        const result = await cryptoService.decryptNode(
            {
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

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "signatureEmail" },
                activeRevision: { ok: true, value: null },
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
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: { ok: true, value: null },
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
                    }
                },
            } as EncryptedNode,
            "parentKey" as unknown as PrivateKey
        );

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: true, value: "signatureEmail" },
                activeRevision: { ok: true, value: null },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
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

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing key signature" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: { ok: true, value: null },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
    });

    it("should decrypt folder node with signature validation error on name", async () => {
        driveCrypto.decryptNodeName = jest.fn(async () => Promise.resolve({
            name: "name",
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
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

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Verification of name signature failed" } },
                activeRevision: { ok: true, value: null },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
    });

    it("should decrypt folder node with signature validation error on hash key", async () => {
        driveCrypto.decryptNodeHashKey = jest.fn(async () => Promise.resolve({
            hashKey: new Uint8Array(),
            verified: VERIFICATION_STATUS.SIGNED_AND_INVALID,
        }));

        const result = await cryptoService.decryptNode(
            {
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

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Verification of hash key signature failed" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: { ok: true, value: null },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
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

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: true, value: "name" },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing key signature" } },
                nameAuthor: { ok: true, value: "nameSignatureEmail" },
                activeRevision: { ok: true, value: null },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: new Uint8Array(),
            },
        });
    });

    it("should handle decrypt of node with key decryption issue", async () => {
        driveCrypto.decryptKey = jest.fn(async () => Promise.reject(new Error("Decryption error")));

        const result = await cryptoService.decryptNode(
            {
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

        expect(result).toEqual({
            node: {
                isStale: false,
                name: { ok: false, error: { name: "", error: "Failed to decrypt node key: Decryption error"} },
                keyAuthor: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Failed to decrypt node key: Decryption error" } },
                nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Failed to decrypt node key: Decryption error" } },
                activeRevision: { ok: false, error: new Error("Failed to decrypt node key: Decryption error") },
            },
        });
    });

    it("should handle decrypt of node with name decryption issue", async () => {
        driveCrypto.decryptNodeName = jest.fn(async () => Promise.reject(new Error("Decryption error")));

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
                isStale: false,
                name: { ok: false, error: { name: "", error: "Decryption error" } },
                keyAuthor: { ok: true, value: "signatureEmail" },
                nameAuthor: { ok: false, error: { claimedAuthor: "nameSignatureEmail", error: "Decryption error" } },
                activeRevision: { ok: true, value: null },
            },
            keys: {
                passphrase: "pass",
                key: "decryptedKey",
                sessionKey: "sessionKey",
                hashKey: undefined,
            },
        });
    });
});
