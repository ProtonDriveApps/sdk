import { PrivateKey } from '../../crypto';
import { Logger, MetricVolumeType } from '../../interface';
import { NotFoundAPIError } from '../apiService';
import { SharesCache } from '../shares/cache';
import { SharesCryptoCache } from '../shares/cryptoCache';
import { SharesCryptoService } from '../shares/cryptoService';
import { EncryptedShare, VolumeShareNodeIDs } from '../shares/interface';
import { PhotosAPIService } from './apiService';
import { SharesService } from './interface';

/**
 * Provides high-level actions for managing photo share.
 *
 * The photo share manager wraps the core share service, but uses photos volume
 * instead of main volume. It provides the same interface so it can be used in
 * the same way in various modules that use shares.
 */
export class PhotoSharesManager {
    private photoRootIds?: VolumeShareNodeIDs;

    constructor(
        private logger: Logger,
        private apiService: PhotosAPIService,
        private cache: SharesCache,
        private cryptoCache: SharesCryptoCache,
        private cryptoService: SharesCryptoService,
        private sharesService: SharesService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.sharesService = sharesService;
    }

    async getRootIDs(): Promise<VolumeShareNodeIDs> {
        if (this.photoRootIds) {
            return this.photoRootIds;
        }

        try {
            const encryptedShare = await this.apiService.getPhotoShare();

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

            this.photoRootIds = {
                volumeId: myFilesShare.volumeId,
                shareId: myFilesShare.shareId,
                rootNodeId: myFilesShare.rootNodeId,
            };
            return this.photoRootIds;
        } catch (error: unknown) {
            if (error instanceof NotFoundAPIError) {
                this.logger.warn('Active photo volume not found, creating a new one');
                return this.createVolume();
            }
            this.logger.error('Failed to get active photo volume', error);
            throw error;
        }
    }

    private async createVolume(): Promise<VolumeShareNodeIDs> {
        const address = await this.sharesService.getMyFilesShareMemberEmailKey();
        const bootstrap = await this.cryptoService.generateVolumeBootstrap(address.addressKey);
        const photoRootIds = await this.apiService.createPhotoVolume(
            {
                addressId: address.addressId,
                addressKeyId: address.addressKeyId,
                ...bootstrap.shareKey.encrypted,
            },
            {
                ...bootstrap.rootNode.key.encrypted,
                encryptedName: bootstrap.rootNode.encryptedName,
                armoredHashKey: bootstrap.rootNode.armoredHashKey,
            },
        );
        await this.cryptoCache.setShareKey(photoRootIds.shareId, bootstrap.shareKey.decrypted);
        return photoRootIds;
    }

    async getSharePrivateKey(shareId: string): Promise<PrivateKey> {
        return this.sharesService.getSharePrivateKey(shareId);
    }

    async getMyFilesShareMemberEmailKey(): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }> {
        return this.sharesService.getMyFilesShareMemberEmailKey();
    }

    async getContextShareMemberEmailKey(shareId: string): Promise<{
        email: string;
        addressId: string;
        addressKey: PrivateKey;
        addressKeyId: string;
    }> {
        return this.sharesService.getContextShareMemberEmailKey(shareId);
    }

    async isOwnVolume(volumeId: string): Promise<boolean> {
        const { volumeId: myVolumeId } = await this.getRootIDs();
        if (volumeId === myVolumeId) {
            return true;
        }
        return this.sharesService.isOwnVolume(volumeId);
    }

    async getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType> {
        const { volumeId: myVolumeId } = await this.getRootIDs();
        if (volumeId === myVolumeId) {
            return MetricVolumeType.OwnVolume;
        }
        return this.sharesService.getVolumeMetricContext(volumeId);
    }

    async loadEncryptedShare(shareId: string): Promise<EncryptedShare> {
        return this.sharesService.loadEncryptedShare(shareId);
    }
}
