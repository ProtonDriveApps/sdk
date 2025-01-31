import { ProtonDriveAccount } from "../../interface/index";
import { NotFoundAPIError } from "../apiService/index";
import { sharesAPIService } from "./apiService";
import { sharesCache } from "./cache";
import { sharesCryptoCache } from "./cryptoCache";
import { sharesCryptoService } from "./cryptoService";

/**
 * Provides high-level actions for managing shares.
 *
 * The manager is responsible for handling shares metadata, including
 * API communication, encryption, decryption, and caching.
 *
 * This module uses other modules providing low-level operations, such
 * as API service, cache, crypto service, etc.
 */
export function sharesManager(
    apiService: ReturnType<typeof sharesAPIService>,
    cache: ReturnType<typeof sharesCache>,
    cryptoCache: ReturnType<typeof sharesCryptoCache>,
    cryptoService: ReturnType<typeof sharesCryptoService>,
    account: ProtonDriveAccount,
) {
    // Cache for My files IDs.
    // Those IDs are required very often, so it is better to keep them in memory.
    // The IDs are not cached in the cache module, as we want to always fetch
    // them from the API, and not from the cache.
    const myFilesIds: {
        volumeId: string;
        shareId: string;
        rootNodeId: string;
    } | null = null;

    /**
     * It returns the IDs of the My files section.
     * 
     * If the default volume or My files section doesn't exist, it creates it.
     */
    async function getMyFilesIDs() {
        if (myFilesIds) {
            return myFilesIds;
        }

        try {
            const encryptedShare = await apiService.getMyFiles();

            // Once any place needs IDs for My files, it will most likely
            // need also the keys for decrypting the tree. It is better to
            // decrypt the share here right away.
            const myFilesShare = await cryptoService.decryptRootShare(encryptedShare);
            await cryptoCache.setShareKey(myFilesShare.shareId, myFilesShare.decryptedCrypto);
            await cache.setVolume({
                volumeId: myFilesShare.volumeId,
                shareId: myFilesShare.shareId,
                rootNodeId: myFilesShare.rootNodeId,
                creatorEmail: myFilesShare.creatorEmail,
            });

            return {
                volumeId: myFilesShare.volumeId,
                shareId: myFilesShare.shareId,
                rootNodeId: myFilesShare.rootNodeId,
            };

        } catch (error: unknown) {
            if (error instanceof NotFoundAPIError) {
                return createVolume();
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
    async function createVolume() {
        const { addressKey, addressId, addressKeyId } = await account.getOwnPrimaryKey();
        const bootstrap = await cryptoService.generateVolumeBootstrap(addressKey);
        const myFilesIds = await apiService.createVolume(
            {
                addressId,
                addressKeyId,
                ...bootstrap.shareKey.encrypted,
            },
            {
                ...bootstrap.rootNode.keys.encrypted,
                encryptedName: bootstrap.rootNode.encryptedName,
                armoredHashKey: bootstrap.rootNode.armoredHashKey,
            },
        );
        await cryptoCache.setShareKey(myFilesIds.shareId, bootstrap.shareKey.decrypted);
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
    async function getSharePrivateKey(shareId: string) {
        const keys = await cryptoCache.getShareKey(shareId);
        if (keys) {
            return keys.key;
        }

        const encryptedShare = await apiService.getRootShare(shareId);
        const share = await cryptoService.decryptRootShare(encryptedShare);
        await cryptoCache.setShareKey(share.shareId, share.decryptedCrypto);
        return share.decryptedCrypto.key;
    }

    async function getVolumeEmailKey(volumeId: string) {
        const volume = await cache.getVolume(volumeId);
        if (volume) {
            return {
                email: volume.creatorEmail,
                key: await account.getOwnPrivateKey(volume.creatorEmail),
            };
        }

        const { shareId } = await apiService.getVolume(volumeId);
        const share = await apiService.getShare(shareId);

        await cache.setVolume({
            volumeId: share.volumeId,
            shareId: share.shareId,
            rootNodeId: share.rootNodeId,
            creatorEmail: share.creatorEmail,
        });

        return {
            email: share.creatorEmail,
            key: await account.getOwnPrivateKey(share.creatorEmail),
        };
    }

    return {
        getMyFilesIDs,
        getSharePrivateKey,
        getVolumeEmailKey,
    }
}
