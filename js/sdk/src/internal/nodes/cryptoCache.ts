import { ProtonDriveCryptoCache } from "../../interface";
import { DecryptedNodeKeys } from "./interface";

/**
 * Provides caching for node crypto material.
 * 
 * The cache is responsible for serialising and deserialising node
 * crypto material.
 */
export class NodesCryptoCache {
    constructor(private driveCache: ProtonDriveCryptoCache) {
        this.driveCache = driveCache;
    }

    async setNodeKeys(nodeUid: string, keys: DecryptedNodeKeys): Promise<void> {
        const cacheUid = getCacheUid(nodeUid);
        this.driveCache.setEntity(cacheUid, keys);
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        const nodeKeysData = await this.driveCache.getEntity(getCacheUid(nodeUid));
        if (!nodeKeysData.passphrase) {
            try {
                await this.removeNodeKeys([nodeUid]);
            } catch {
                // TODO: log error
            }
            throw new Error(`Failed to deserialize node keys: missing passphrase`);
        }
        return {
            ...nodeKeysData,
            passphrase: nodeKeysData.passphrase,
        };
    }

    async removeNodeKeys(nodeUids: string[]): Promise<void> {
        const cacheUids = nodeUids.map(getCacheUid);
        await this.driveCache.removeEntities(cacheUids);
    }
}

function getCacheUid(nodeUid: string) {
    return `nodeKeys-${nodeUid}`;
}
