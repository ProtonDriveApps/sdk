import { ProtonDriveCryptoCache } from "../../interface";
import { DecryptedShareKey } from "./interface";

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
    constructor(private driveCache: ProtonDriveCryptoCache) {
        this.driveCache = driveCache;
    }

    async setShareKey(shareId: string, key: DecryptedShareKey): Promise<void> {
        await this.driveCache.setEntity(getCacheUid(shareId), key);
    }

    async getShareKey(shareId: string): Promise<DecryptedShareKey> {
        return this.driveCache.getEntity(getCacheUid(shareId));
    }

    async removeShareKey(shareIds: string[]): Promise<void> {
        await this.driveCache.removeEntities(shareIds.map(getCacheUid));
    }
}

function getCacheUid(shareId: string) {
    return `shareKey-${shareId}`;
}
