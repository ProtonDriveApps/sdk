import { ProtonDriveCryptoCache, Logger } from "../../interface";
import { DecryptedNodeKeys } from "./interface";

/**
 * Provides caching for node crypto material.
 * 
 * The cache is responsible for serialising and deserialising node
 * crypto material.
 */
export class NodesCryptoCache {
    constructor(private logger: Logger, private driveCache: ProtonDriveCryptoCache) {
        this.logger = logger;
        this.driveCache = driveCache;
    }

    async setNodeKeys(nodeUid: string, keys: DecryptedNodeKeys): Promise<void> {
        const cacheUid = getCacheKey(nodeUid);
        await this.driveCache.setEntity(cacheUid, keys);
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        const nodeKeysData = await this.driveCache.getEntity(getCacheKey(nodeUid));
        if (!nodeKeysData.passphrase) {
            try {
                await this.removeNodeKeys([nodeUid]);
            } catch (removingError: unknown) {
                // The node keys will not be returned, thus SDK will re-fetch
                // and re-cache it. Setting it again should then fix the problem.
                this.logger.warn(`Failed to remove corrupted node keys from the cache: ${removingError instanceof Error ? removingError.message : removingError}`);
            }
            throw new Error(`Failed to deserialize node keys: missing passphrase`);
        }
        return {
            ...nodeKeysData,
            passphrase: nodeKeysData.passphrase,
        };
    }

    async removeNodeKeys(nodeUids: string[]): Promise<void> {
        const cacheUids = nodeUids.map(getCacheKey);
        await this.driveCache.removeEntities(cacheUids);
    }
}

function getCacheKey(nodeUid: string) {
    return `nodeKeys-${nodeUid}`;
}
