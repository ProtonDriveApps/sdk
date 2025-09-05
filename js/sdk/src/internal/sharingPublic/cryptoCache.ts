import { PrivateKey } from '../../crypto';
import { ProtonDriveCryptoCache, Logger } from '../../interface';
import { DecryptedNodeKeys } from './interface';

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

    async setNodeKeys(nodeUid: string, keys: DecryptedNodeKeys): Promise<void> {
        const cacheUid = getNodeCacheKey(nodeUid);
        await this.driveCache.setEntity(cacheUid, {
            nodeKeys: keys,
        });
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        const nodeKeysData = await this.driveCache.getEntity(getNodeCacheKey(nodeUid));
        if (!nodeKeysData.nodeKeys) {
            try {
                await this.removeNodeKeys([nodeUid]);
            } catch (removingError: unknown) {
                // The node keys will not be returned, thus SDK will re-fetch
                // and re-cache it. Setting it again should then fix the problem.
                this.logger.warn(
                    `Failed to remove corrupted public node keys from the cache: ${removingError instanceof Error ? removingError.message : removingError}`,
                );
            }
            throw new Error(`Failed to deserialize public node keys`);
        }
        return nodeKeysData.nodeKeys;
    }

    async removeNodeKeys(nodeUids: string[]): Promise<void> {
        const cacheUids = nodeUids.map(getNodeCacheKey);
        await this.driveCache.removeEntities(cacheUids);
    }
}

function getShareKeyCacheKey() {
    return 'publicShareKey';
}

function getNodeCacheKey(nodeUid: string) {
    return `publicNodeKeys-${nodeUid}`;
}
