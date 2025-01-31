import { serializePrivateKey, deserializePrivateKey, serializeSessionKey, deserializeSessionKey } from "../../crypto";
import { ProtonDriveCache } from "../../cache";
import { DecryptedShareCrypto } from "./interface";

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
export function sharesCryptoCache(driveCache: ProtonDriveCache) {
    async function setShareKey(shareId: string, keys: DecryptedShareCrypto) {
        await driveCache.setEntity(getCacheUid(shareId), serializeShareKey(keys));
    }

    async function getShareKey(shareId: string): Promise<DecryptedShareCrypto> {
        const shareKeyData = await driveCache.getEntity(getCacheUid(shareId));
        try {
            const keys = await deserializeShareKey(shareKeyData);
            return keys;
        } catch (error: unknown) {
            try {
                await removeShareKey([shareId]);
            } catch (error: unknown) {
                // TODO: log error
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to deserialize share keys: ${errorMessage}`);
        }
    }

    async function removeShareKey(shareIds: string[]) {
        await driveCache.removeEntities(shareIds.map(getCacheUid));
    }

    function getCacheUid(shareId: string) {
        return `shareKey-${shareId}`;
    }

    function serializeShareKey(keys: DecryptedShareCrypto) {
        // TODO: verify how we want to serialize keys
        return JSON.stringify({
            key: serializePrivateKey(keys.key),
            sessionKey: serializeSessionKey(keys.sessionKey),
        });
    }

    async function deserializeShareKey(shareKeyData: string): Promise<DecryptedShareCrypto> {
        const result = JSON.parse(shareKeyData);
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid share keys data');
        }

        let key, sessionKey;

        try {
            key = await deserializePrivateKey(result.key);
        } catch (error: any) {
            throw new Error(`Invalid share private key: ${error}`);
        }
        try {
            sessionKey = deserializeSessionKey(result.sessionKey);
        } catch (error: any) {
            throw new Error(`Invalid share session key: ${error}`);
        }
        
        return {
            key,
            sessionKey,
        };
    }

    return {
        setShareKey,
        getShareKey,
        removeShareKey,
    }
}
