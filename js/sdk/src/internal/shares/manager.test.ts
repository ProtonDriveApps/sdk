import { ProtonDriveAccount } from "../../interface";
import { NotFoundAPIError } from "../apiService";
import { SharesAPIService } from "./apiService";
import { SharesCache } from "./cache";
import { SharesCryptoCache } from "./cryptoCache";
import { SharesCryptoService } from "./cryptoService";
import { SharesManager } from "./manager";

describe("SharesManager", () => {
    let apiService: SharesAPIService;
    let cache: SharesCache;
    let cryptoCache: SharesCryptoCache;
    let cryptoService: SharesCryptoService;
    let account: ProtonDriveAccount;

    let manager: SharesManager;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            getMyFiles: jest.fn(),
            getRootShare: jest.fn(),
            getShare: jest.fn(),
            getVolume: jest.fn(),
            createVolume: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cache = {
            setVolume: jest.fn(),
            getVolume: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoCache = {
            setShareKey: jest.fn(),
            getShareKey: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            generateVolumeBootstrap: jest.fn(),
            decryptRootShare: jest.fn(),
        }
        // @ts-expect-error No need to implement all methods for mocking
        account = {
            getOwnPrimaryKey: jest.fn(),
            getOwnPrivateKey: jest.fn(),
        }

        manager = new SharesManager(apiService, cache, cryptoCache, cryptoService, account);
    });

    describe("getMyFilesIDs", () => {
        const myFilesShare = {
            shareId: "myFilesShareId",
            volumeId: "myFilesVolumeId",
            rootNodeId: "myFilesRootNodeId",
        };

        it("should load My files IDs once", async () => {
            const encryptedShare = {
                share: myFilesShare,
                creatorEmail: "email",
            };
            const key = {
                key: "privateKey",
                sessionKey: "sessionKey",
            };
        
            apiService.getMyFiles = jest.fn().mockResolvedValue(encryptedShare);
            cryptoService.decryptRootShare = jest.fn().mockResolvedValue({ share: myFilesShare, key });
    
            // Calling twice to check if it loads only once.
            await manager.getMyFilesIDs();
            const result = await manager.getMyFilesIDs();
    
            expect(result).toStrictEqual(myFilesShare);
            expect(apiService.getMyFiles).toHaveBeenCalledTimes(1);
            expect(cryptoService.decryptRootShare).toHaveBeenCalledTimes(1);
            expect(cryptoCache.setShareKey).toHaveBeenCalledWith(myFilesShare.shareId, key);
            expect(cache.setVolume).toHaveBeenCalledWith({
                ...myFilesShare,
                creatorEmail: encryptedShare.creatorEmail,
            });
            expect(apiService.createVolume).not.toHaveBeenCalled();
        });

        it("should create volume when My files section doesn't exist", async () => {
            apiService.getMyFiles = jest.fn().mockRejectedValue(new NotFoundAPIError("no active volume", 0));
            account.getOwnPrimaryKey = jest.fn().mockResolvedValue({ addressKey: "addressKey" });
            cryptoService.generateVolumeBootstrap = jest.fn().mockResolvedValue({
                shareKey: {
                    encrypted: "encrypted share key",
                    decrypted: "decrypted share key",
                },
                rootNode: {
                    key: {
                        encrypted: "encrypted root key",
                    },
                }
            });
            apiService.createVolume = jest.fn().mockResolvedValue(myFilesShare);

            const result = await manager.getMyFilesIDs();

            expect(result).toStrictEqual(myFilesShare);
            expect(cryptoService.decryptRootShare).not.toHaveBeenCalled();
            expect(cryptoCache.setShareKey).toHaveBeenCalledWith("myFilesShareId", "decrypted share key");
        });

        it("should throw on unknown error", async () => {
            apiService.getMyFiles = jest.fn().mockRejectedValue(new Error("Some error"));

            expect(manager.getMyFilesIDs()).rejects.toThrow("Some error");
            expect(cryptoService.decryptRootShare).not.toHaveBeenCalled();
            expect(apiService.createVolume).not.toHaveBeenCalled();

        });
    });

    describe("getSharePrivateKey", () => {
        it("should return cached private key", async () => {
            cryptoCache.getShareKey = jest.fn().mockResolvedValue({ key: "cachedPrivateKey" });

            const result = await manager.getSharePrivateKey("shareId");

            expect(result).toBe("cachedPrivateKey");
        });

        it("should load private key if not in cache", async () => {
            cryptoCache.getShareKey = jest.fn().mockRejectedValue(new Error('not found'));
            apiService.getRootShare = jest.fn().mockResolvedValue({ shareId: "shareId" });
            cryptoService.decryptRootShare = jest.fn().mockResolvedValue({ key: { key: "privateKey" } });

            const result = await manager.getSharePrivateKey("shareId");

            expect(result).toBe("privateKey");
            expect(cryptoCache.setShareKey).toHaveBeenCalledWith("shareId", { key: "privateKey" });
        });
    });

    describe("getVolumeEmailKey", () => {
        it("should return cached volume email key", async () => {
            cache.getVolume = jest.fn().mockResolvedValue({ creatorEmail: "email" });
            account.getOwnPrivateKey = jest.fn().mockResolvedValue("creatorKey");

            const result = await manager.getVolumeEmailKey("volumeId");

            expect(result).toEqual({
                email: "email",
                key: "creatorKey",
            });
        });

        it("should load volume email key if not in cache", async () => {
            const share = {
                volumeId: "volumeId",
                shareId: "shareId",
                rootNodeId: "rootNodeId",
                creatorEmail: "email",
            }
            cache.getVolume = jest.fn().mockRejectedValue(new Error('not found'));
            apiService.getVolume = jest.fn().mockResolvedValue({ shareId: "shareId" });
            apiService.getShare = jest.fn().mockResolvedValue(share);
            account.getOwnPrivateKey = jest.fn().mockResolvedValue("creatorKey");

            const result = await manager.getVolumeEmailKey("volumeId");

            expect(result).toEqual({
                email: "email",
                key: "creatorKey",
            });
            expect(cache.setVolume).toHaveBeenCalledWith(share);
        });
    });
});
