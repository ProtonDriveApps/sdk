import { Logger, MetricVolumeType, ProtonDriveAccount } from '../../interface';
import { PrivateKey } from '../../crypto';
import { NotFoundAPIError } from '../apiService';
import { SharesAPIService } from './apiService';
import { SharesCache } from './cache';
import { SharesCryptoCache } from './cryptoCache';
import { SharesCryptoService } from './cryptoService';
import { VolumeShareNodeIDs, EncryptedShare, EncryptedRootShare } from './interface';

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

    private rootShares: Map<string, EncryptedRootShare> = new Map();

    constructor(
        private logger: Logger,
        private apiService: SharesAPIService,
        private cache: SharesCache,
        private cryptoCache: SharesCryptoCache,
        private cryptoService: SharesCryptoService,
        private account: ProtonDriveAccount,
    ) {
        this.logger = logger;
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
    async getOwnVolumeIDs(): Promise<VolumeShareNodeIDs> {
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
                addressId: encryptedShare.addressId,
            });

            this.myFilesIds = {
                volumeId: myFilesShare.volumeId,
                shareId: myFilesShare.shareId,
                rootNodeId: myFilesShare.rootNodeId,
            };
            return this.myFilesIds;
        } catch (error: unknown) {
            if (error instanceof NotFoundAPIError) {
                this.logger.warn('Active volume not found, creating a new one');
                return this.createVolume();
            }
            this.logger.error('Failed to get active volume', error);
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
    private async createVolume(): Promise<VolumeShareNodeIDs> {
        const address = await this.account.getOwnPrimaryAddress();
        const primaryKey = address.keys[address.primaryKeyIndex];
        const bootstrap = await this.cryptoService.generateVolumeBootstrap(primaryKey.key);
        const myFilesIds = await this.apiService.createVolume(
            {
                addressId: address.addressId,
                addressKeyId: primaryKey.id,
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

    async getMyFilesShareMemberEmailKey(): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }> {
        const { volumeId } = await this.getOwnVolumeIDs();

        try {
            const { addressId } = await this.cache.getVolume(volumeId);
            const address = await this.account.getOwnAddress(addressId);
            return {
                email: address.email,
                addressId,
                addressKey: address.keys[address.primaryKeyIndex].key,
                addressKeyId: address.keys[address.primaryKeyIndex].id,
            };
        } catch {}

        const { shareId } = await this.apiService.getVolume(volumeId);
        const share = await this.apiService.getRootShare(shareId);

        await this.cache.setVolume({
            volumeId: share.volumeId,
            shareId: share.shareId,
            rootNodeId: share.rootNodeId,
            creatorEmail: share.creatorEmail,
            addressId: share.addressId,
        });

        const address = await this.account.getOwnAddress(share.addressId);
        return {
            email: address.email,
            addressId: share.addressId,
            addressKey: address.keys[address.primaryKeyIndex].key,
            addressKeyId: address.keys[address.primaryKeyIndex].id,
        };
    }

    async getContextShareMemberEmailKey(shareId: string): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }> {
        let encryptedShare = this.rootShares.get(shareId);
        if (!encryptedShare) {
            encryptedShare = await this.apiService.getRootShare(shareId);
            this.rootShares.set(shareId, encryptedShare);
        }

        const address = await this.account.getOwnAddress(encryptedShare.addressId);

        return {
            email: address.email,
            addressId: encryptedShare.addressId,
            addressKey: address.keys[address.primaryKeyIndex].key,
            addressKeyId: address.keys[address.primaryKeyIndex].id,
        };
    }

    async isOwnVolume(volumeId: string): Promise<boolean> {
        return (await this.getOwnVolumeIDs()).volumeId === volumeId;
    }

    async getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType> {
        const { volumeId: myVolumeId } = await this.getOwnVolumeIDs();

        // SDK doesn't support public sharing yet, also public sharing
        // doesn't use a volume but shareURL, thus we can simplify and
        // ignore this case for now.
        if (volumeId === myVolumeId) {
            return MetricVolumeType.OwnVolume;
        }
        return MetricVolumeType.Shared;
    }

    async loadEncryptedShare(shareId: string): Promise<EncryptedShare> {
        return this.apiService.getShare(shareId);
    }
}
