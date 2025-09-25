import { PrivateKey } from '../../crypto';
import { ProtonDriveCryptoCache, Logger } from '../../interface';

/**
 * Provides caching for public link crypto material.
 *
 * The cache is responsible for serialising and deserialising public link
 * crypto material.
 */
export class SharingPublicCryptoCache {
    constructor(
        private logger: Logger,
        private driveCache: ProtonDriveCryptoCache,
    ) {
        this.logger = logger;
        this.driveCache = driveCache;
    }

    async setShareKey(shareKey: PrivateKey): Promise<void> {
        await this.driveCache.setEntity(getShareKeyCacheKey(), {
            publicShareKey: {
                key: shareKey,
            },
        });
    }

    async getShareKey(): Promise<PrivateKey> {
        const shareKeyData = await this.driveCache.getEntity(getShareKeyCacheKey());
        if (!shareKeyData.publicShareKey) {
            try {
                await this.driveCache.removeEntities([getShareKeyCacheKey()]);
            } catch (removingError: unknown) {
                this.logger.warn(
                    `Failed to remove corrupted public share key from the cache: ${removingError instanceof Error ? removingError.message : removingError}`,
                );
            }
            throw new Error('Failed to deserialize public share key');
        }
        return shareKeyData.publicShareKey.key;
    }
}

function getShareKeyCacheKey() {
    return 'publicShareKey';
}
