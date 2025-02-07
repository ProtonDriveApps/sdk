import { serializePrivateKey, deserializePrivateKey, serializeSessionKey, deserializeSessionKey } from "../../crypto";
import { ProtonDriveCache } from "../../cache";
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
    constructor(private driveCache: ProtonDriveCache) {
        this.driveCache = driveCache;
    }

    async setShareKey(shareId: string, key: DecryptedShareKey): Promise<void> {
        await this.driveCache.setEntity(getCacheUid(shareId), serializeShareKey(key));
    }

    async getShareKey(shareId: string): Promise<DecryptedShareKey> {
        const shareKeyData = await this.driveCache.getEntity(getCacheUid(shareId));
        try {
            const key = await deserializeShareKey(shareKeyData);
            return key;
        } catch (error: unknown) {
            try {
                await this.removeShareKey([shareId]);
            } catch {
                // TODO: log error
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to deserialize share keys: ${errorMessage}`);
        }
    }

    async removeShareKey(shareIds: string[]): Promise<void> {
        await this.driveCache.removeEntities(shareIds.map(getCacheUid));
    }
}

function getCacheUid(shareId: string) {
    return `shareKey-${shareId}`;
}

function serializeShareKey(key: DecryptedShareKey) {
    // TODO: verify how we want to serialize keys
    return JSON.stringify({
        key: serializePrivateKey(key.key),
        sessionKey: serializeSessionKey(key.sessionKey),
    });
}

async function deserializeShareKey(shareKeyData: string): Promise<DecryptedShareKey> {
    const result = JSON.parse(shareKeyData);
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid share keys data');
    }

    let key, sessionKey;

    try {
        key = await deserializePrivateKey(result.key);
    } catch (error: unknown) {
        throw new Error(`Invalid share private key: ${error instanceof Error ? error.message : error}`);
    }
    try {
        sessionKey = deserializeSessionKey(result.sessionKey);
    } catch (error: unknown) {
        throw new Error(`Invalid share session key: ${error instanceof Error ? error.message : error}`);
    }
    
    return {
        key,
        sessionKey,
    };
}
