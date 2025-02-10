import { ProtonDriveAccount } from "../../interface";
import { PrivateKey } from "../../crypto";
import { NotFoundAPIError } from "../apiService";
import { SharesAPIService } from "./apiService";
import { SharesCache } from "./cache";
import { SharesCryptoCache } from "./cryptoCache";
import { SharesCryptoService } from "./cryptoService";
import { VolumeShareNodeIDs } from "./interface";

/**
 * Provides high-level actions for managing shares.
 *
 * The manager is responsible for handling shares metadata, including
 * API communication, encryption, decryption, and caching.
 *
 * This module uses other modules providing low-level operations, such
 * as API service, cache, crypto service, etc.
 */
export class SharesManager {
    // Cache for My files IDs.
    // Those IDs are required very often, so it is better to keep them in memory.
    // The IDs are not cached in the cache module, as we want to always fetch
    // them from the API, and not from the this.cache.
    private myFilesIds?: VolumeShareNodeIDs;

    constructor(
        private apiService: SharesAPIService,
        private cache: SharesCache,
        private cryptoCache: SharesCryptoCache,
        private cryptoService: SharesCryptoService,
        private account: ProtonDriveAccount,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.account = account;
    }

    /**
     * It returns the IDs of the My files section.
     * 
     * If the default volume or My files section doesn't exist, it creates it.
     */
    async getMyFilesIDs(): Promise<VolumeShareNodeIDs> {
        if (this.myFilesIds) {
            return this.myFilesIds;
        }

        try {
            const encryptedShare = await this.apiService.getMyFiles();

            // Once any place needs IDs for My files, it will most likely
            // need also the keys for decrypting the tree. It is better to
            // decrypt the share here right away.
            const { share: myFilesShare, key } = await this.cryptoService.decryptRootShare(encryptedShare);
            await this.cryptoCache.setShareKey(myFilesShare.shareId, key);
            await this.cache.setVolume({
                volumeId: myFilesShare.volumeId,
                shareId: myFilesShare.shareId,
                rootNodeId: myFilesShare.rootNodeId,
                creatorEmail: encryptedShare.creatorEmail,
            });

            this.myFilesIds = {
                volumeId: myFilesShare.volumeId,
                shareId: myFilesShare.shareId,
                rootNodeId: myFilesShare.rootNodeId,
            };
            return this.myFilesIds;
        } catch (error: unknown) {
            if (error instanceof NotFoundAPIError) {
                return this.createVolume();
            }
            throw error;
        }
    }

    /**
     * Creates new default volume for the user.
     * 
     * It generates the volume bootstrap, creates the volume on the server,
     * and caches the volume metadata.
     * 
     * User can have only one default volume.
     * 
     * @throws If the volume cannot be created (e.g., one already exists).
     */
    async createVolume(): Promise<VolumeShareNodeIDs> {
        const { addressKey, addressId, addressKeyId } = await this.account.getOwnPrimaryKey();
        const bootstrap = await this.cryptoService.generateVolumeBootstrap(addressKey);
        const myFilesIds = await this.apiService.createVolume(
            {
                addressId,
                addressKeyId,
                ...bootstrap.shareKey.encrypted,
            },
            {
                ...bootstrap.rootNode.key.encrypted,
                encryptedName: bootstrap.rootNode.encryptedName,
                armoredHashKey: bootstrap.rootNode.armoredHashKey,
            },
        );
        await this.cryptoCache.setShareKey(myFilesIds.shareId, bootstrap.shareKey.decrypted);
        return myFilesIds;
    }

    /**
     * It is a high-level action that retrieves the private key for a share.
     * If prefers to use the cache, but if the key is not there, it fetches
     * the share from the API, decrypts it, and caches it.
     * 
     * @param shareId - The ID of the share.
     * @returns The private key for the share.
     * @throws If the share is not found or cannot be decrypted, or cached.
     */
    async getSharePrivateKey(shareId: string): Promise<PrivateKey> {
        try {
            const { key } = await this.cryptoCache.getShareKey(shareId);
            return key;
        } catch {}

        const encryptedShare = await this.apiService.getRootShare(shareId);
        const { key } = await this.cryptoService.decryptRootShare(encryptedShare);
        await this.cryptoCache.setShareKey(shareId, key);
        return key.key;
    }

    async getVolumeEmailKey(volumeId: string): Promise<{ email: string, key: PrivateKey }> {
        try {
            const { creatorEmail } = await this.cache.getVolume(volumeId);
            return {
                email: creatorEmail,
                key: await this.account.getOwnPrivateKey(creatorEmail),
            };
        } catch {}

        const { shareId } = await this.apiService.getVolume(volumeId);
        const share = await this.apiService.getShare(shareId);

        await this.cache.setVolume({
            volumeId: share.volumeId,
            shareId: share.shareId,
            rootNodeId: share.rootNodeId,
            creatorEmail: share.creatorEmail,
        });

        return {
            email: share.creatorEmail,
            key: await this.account.getOwnPrivateKey(share.creatorEmail),
        };
    }
}
