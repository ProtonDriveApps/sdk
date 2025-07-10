import { DriveCrypto, PrivateKey } from "../../crypto";
import { MetricVolumeType, NodeType, ProtonDriveAccount, ProtonDriveTelemetry, resultError, resultOk } from "../../interface";
import { getMockTelemetry } from "../../tests/telemetry";
import { SharesService } from "./interface";
import { SharingCryptoService } from "./cryptoService";

describe("SharingCryptoService", () => {
    let telemetry: ProtonDriveTelemetry;
    let driveCrypto: DriveCrypto;
    let account: ProtonDriveAccount;
    let sharesService: SharesService;
    let cryptoService: SharingCryptoService;

    beforeEach(() => {
        telemetry = getMockTelemetry();
        // @ts-expect-error No need to implement all methods for mocking
        driveCrypto = {
            decryptShareUrlPassword: jest.fn().mockResolvedValue("urlPassword"),
            decryptKeyWithSrpPassword: jest.fn().mockResolvedValue({
                key: "decryptedKey" as unknown as PrivateKey,
            }),
            decryptNodeName: jest.fn().mockResolvedValue({
                name: "nodeName",
            }),
        };
        account = {
            // @ts-expect-error No need to implement full response for mocking
            getOwnAddress: jest.fn(async () => ({
                keys: [{ key: "addressKey" as unknown as PrivateKey }],
            })),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getMyFilesShareMemberEmailKey: jest.fn().mockResolvedValue({
                addressId: "addressId",
            }),
        };
        cryptoService = new SharingCryptoService(telemetry, driveCrypto, account, sharesService);
    });

    describe("decryptBookmark", () => {
        const encryptedBookmark = {
            tokenId: "tokenId",
            creationTime: new Date(),
            url: {
                encryptedUrlPassword: "encryptedUrlPassword",
                base64SharePasswordSalt: "base64SharePasswordSalt",
            },
            share: {
                armoredKey: "armoredKey",
                armoredPassphrase: "armoredPassphrase",
            },
            node: {
                type: NodeType.File,
                mediaType: "mediaType",
                encryptedName: "encryptedName",
                armoredKey: "armoredKey",
                armoredNodePassphrase: "armoredNodePassphrase",
                file: {
                    base64ContentKeyPacket: "base64ContentKeyPacket",
                },
            },
        }

        it("should decrypt bookmark", async () => {
            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk("https://drive.proton.me/urls/tokenId#urlPassword"),
                nodeName: resultOk("nodeName"),
            });
            expect(driveCrypto.decryptShareUrlPassword).toHaveBeenCalledWith("encryptedUrlPassword", ["addressKey"]);
            expect(driveCrypto.decryptKeyWithSrpPassword).toHaveBeenCalledWith("urlPassword", "base64SharePasswordSalt", "armoredKey", "armoredPassphrase");
            expect(driveCrypto.decryptNodeName).toHaveBeenCalledWith("encryptedName", "decryptedKey", []);
            expect(telemetry.logEvent).not.toHaveBeenCalled();
        });

        it("should handle undecryptable URL password", async () => {
            const error = new Error("Failed to decrypt URL password");
            driveCrypto.decryptShareUrlPassword = jest.fn().mockRejectedValue(error);

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultError(new Error("Failed to decrypt bookmark password: Failed to decrypt URL password")),
                nodeName: resultError(new Error("Failed to decrypt bookmark password: Failed to decrypt URL password")),
            });
            expect(telemetry.logEvent).toHaveBeenCalledWith({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'shareUrlPassword',
                error,
            });
        });

        it("should handle undecryptable share key", async () => {
            const error = new Error("Failed to decrypt share key");
            driveCrypto.decryptKeyWithSrpPassword = jest.fn().mockRejectedValue(error);

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk("https://drive.proton.me/urls/tokenId#urlPassword"),
                nodeName: resultError(new Error("Failed to decrypt bookmark key: Failed to decrypt share key")),
            });
            expect(telemetry.logEvent).toHaveBeenCalledWith({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'shareKey',
                error,
            });
        });

        it("should handle undecryptable node name", async () => {
            const error = new Error("Failed to decrypt node name");
            driveCrypto.decryptNodeName = jest.fn().mockRejectedValue(error);

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk("https://drive.proton.me/urls/tokenId#urlPassword"),
                nodeName: resultError(new Error("Failed to decrypt bookmark name: Failed to decrypt node name")),
            });
            expect(telemetry.logEvent).toHaveBeenCalledWith({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'nodeName',
                error,
            });
        });

        it("should handle invalid node name", async () => {
            driveCrypto.decryptNodeName = jest.fn().mockResolvedValue({
                name: "invalid/name",
            });

            const result = await cryptoService.decryptBookmark(encryptedBookmark);

            expect(result).toMatchObject({
                url: resultOk("https://drive.proton.me/urls/tokenId#urlPassword"),
                nodeName: resultError({
                    name: "invalid/name",
                    error: "Name must not contain the character '/'",
                }),
            });
        });
    });
});
