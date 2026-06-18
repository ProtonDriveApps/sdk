import { Logger, ProtonDriveCryptoCache } from '../../interface';
import { DecryptedShareKey } from './interface';

/**
 * Provides caching for share crypto material.
 *
 * The cache is responsible for serialising and deserialising share
 * crypto material.
 *
 * The share crypto materials are cached so the updates to the root
 * nodes can be decrypted without the need to fetch the share keys
 * from the server again. Otherwise the rest of the tree requires
 * only the root node, thus share cache is not needed.
 */
export class SharesCryptoCache {
    constructor(
        private logger: Logger,
        private driveCache: ProtonDriveCryptoCache,
    ) {
        this.logger = logger;
        this.driveCache = driveCache;
    }

    async setShareKey(shareId: string, key: DecryptedShareKey): Promise<void> {
        await this.driveCache.setEntity(getCacheKey(shareId), {
            shareKey: key,
        });
    }

    async getShareKey(shareId: string): Promise<DecryptedShareKey> {
        const nodeKeysData = await this.driveCache.getEntity(getCacheKey(shareId));
        if (!nodeKeysData.shareKey) {
            try {
                await this.removeShareKeys([shareId]);
            } catch (removingError: unknown) {
                // The node keys will not be returned, thus SDK will re-fetch
                // and re-cache it. Setting it again should then fix the problem.
                this.logger.warn(
                    `Failed to remove corrupted node keys from the cache: ${removingError instanceof Error ? removingError.message : removingError}`,
                );
            }
            throw new Error(`Failed to deserialize node keys`);
        }
        return nodeKeysData.shareKey;
    }

    async removeShareKeys(shareIds: string[]): Promise<void> {
        await this.driveCache.removeEntities(shareIds.map(getCacheKey));
    }
}

function getCacheKey(shareId: string) {
    return `shareKey-${shareId}`;
}
