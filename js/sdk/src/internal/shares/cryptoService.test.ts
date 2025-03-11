import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from "../../crypto";
import { ProtonDriveAccount, ProtonDriveTelemetry } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { EncryptedRootShare } from "./interface";
import { SharesCryptoService } from "./cryptoService";

describe("SharesCryptoService", () => {
    let telemetry: ProtonDriveTelemetry;
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let cryptoService: SharesCryptoService;

    beforeEach(() => {
        telemetry = getMockTelemetry();
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {
            decryptKey: jest.fn(async () => Promise.resolve({
                passphrase: "pass",
                key: "decryptedKey" as unknown as PrivateKey,
                sessionKey: "sessionKey" as unknown as SessionKey,
                verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
            })),
        };
        account = {
            // @ts-expect-error No need to implement full response for mocking
            getOwnAddress: jest.fn(async () => ({
                keys: [{ key: "addressKey" as unknown as PrivateKey }],
            })),
            getPublicKeys: jest.fn(async () => []),
        };
        cryptoService = new SharesCryptoService(telemetry, driveCrypto, account);
    });

    it("should decrypt root share", async () => {
        const result = await cryptoService.decryptRootShare(
            {
                shareId: "shareId",
                addressId: "addressId",
                creatorEmail: "signatureEmail",
                encryptedCrypto: {
                    armoredKey: "armoredKey",
                    armoredPassphrase: "armoredPassphrase",
                    armoredPassphraseSignature: "armoredPassphraseSignature",
                },
            } as EncryptedRootShare,
        );

        expect(result).toMatchObject({
            share: {
                shareId: "shareId",
                author: { ok: true, value: "signatureEmail" },
            },
            key: {
                key: "decryptedKey",
                sessionKey: "sessionKey",
            },
        });

        expect(account.getOwnAddress).toHaveBeenCalledWith("addressId");
        expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
        expect(telemetry.logEvent).not.toHaveBeenCalled();
    });

    it("should decrypt root share with signiture verification error", async () => {
        driveCrypto.decryptKey = jest.fn(async () => Promise.resolve({
            passphrase: "pass",
            key: "decryptedKey" as unknown as PrivateKey,
            sessionKey: "sessionKey" as unknown as SessionKey,
            verified: VERIFICATION_STATUS.NOT_SIGNED,
        }));

        const result = await cryptoService.decryptRootShare(
            {
                shareId: "shareId",
                addressId: "addressId",
                creatorEmail: "signatureEmail",
                encryptedCrypto: {
                    armoredKey: "armoredKey",
                    armoredPassphrase: "armoredPassphrase",
                    armoredPassphraseSignature: "armoredPassphraseSignature",
                },
            } as EncryptedRootShare,
        );

        expect(result).toMatchObject({
            share: {
                shareId: "shareId",
                author: { ok: false, error: { claimedAuthor: "signatureEmail", error: "Missing signature" } },
            },
            key: {
                key: "decryptedKey",
                sessionKey: "sessionKey",
            },
        });

        expect(account.getOwnAddress).toHaveBeenCalledWith("addressId");
        expect(account.getPublicKeys).toHaveBeenCalledWith("signatureEmail");
        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: 'verificationError',
            context: 'own_volume',
            verificationKey: 'ShareAddress',
            addressMatchingDefaultShare: undefined,
            fromBefore2024: undefined,
        });
    });

    it("should handle decrypt issue of root share", async () => {
        const error = new Error("Decryption error");
        driveCrypto.decryptKey = jest.fn(async () => Promise.reject(error));

        const result = cryptoService.decryptRootShare(
            {
                shareId: "shareId",
                addressId: "addressId",
                creatorEmail: "signatureEmail",
                encryptedCrypto: {
                    armoredKey: "armoredKey",
                    armoredPassphrase: "armoredPassphrase",
                    armoredPassphraseSignature: "armoredPassphraseSignature",
                },
            } as EncryptedRootShare,
        );

        await expect(result).rejects.toThrow(error);

        expect(telemetry.logEvent).toHaveBeenCalledWith({
            eventName: 'decryptionError',
            context: 'own_volume',
            entity: 'share',
            fromBefore2024: undefined,
            error,
        });
    });
});
