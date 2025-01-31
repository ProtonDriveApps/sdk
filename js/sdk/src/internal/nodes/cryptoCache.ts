import { ProtonDriveCache } from "../../cache";
import { serializePrivateKey, deserializePrivateKey, serializeSessionKey, deserializeSessionKey, serializeHashKey, deserializeHashKey } from "../../crypto";
import { DecryptedNodeKeys } from "./interface";

/**
 * Provides caching for node crypto material.
 * 
 * The cache is responsible for serialising and deserialising node
 * crypto material.
 */
export function nodesCryptoCache(driveCache: ProtonDriveCache) {
    async function setNodeKeys(nodeUid: string, keys: DecryptedNodeKeys) {
        const cacheUid = getCacheUid(nodeUid);
        const nodeKeysData = serializeNodeKeys(keys);
        driveCache.setEntity(cacheUid, nodeKeysData);
    }

    async function getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        const nodeKeysData = await driveCache.getEntity(getCacheUid(nodeUid));
        try {
            const keys = await deserializeNodeKeys(nodeKeysData);
            return keys;
        } catch (error: unknown) {
            try {
                await removeNodeKeys([nodeUid]);
            } catch (error: unknown) {
                // TODO: log error
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to deserialize node keys: ${errorMessage}`);
        }
    }

    async function removeNodeKeys(nodeUids: string[]) {
        const cacheUids = nodeUids.map(getCacheUid);
        await driveCache.removeEntities(cacheUids);
    }

    function getCacheUid(nodeUid: string) {
        return `nodeKeys-${nodeUid}`;
    }
    
    function serializeNodeKeys(keys: DecryptedNodeKeys) {
        // TODO: verify how we want to serialize keys
        return JSON.stringify({
            passphrase: keys.passphrase,
            key: serializePrivateKey(keys.key),
            sessionKey: serializeSessionKey(keys.sessionKey),
            hashKey: keys.hashKey ? serializeHashKey(keys.hashKey) : undefined,
        });
    }

    async function deserializeNodeKeys(shareKeyData: string): Promise<DecryptedNodeKeys> {
        const result = JSON.parse(shareKeyData);
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid node keys data');
        }

        let key, sessionKey, hashKey;

        if (!result.passphrase || typeof result.passphrase !== 'string') {
            throw new Error('Invalid node passphrase');
        }
        const passphrase = result.passphrase;
        try {
            key = await deserializePrivateKey(result.key);
        } catch (error: any) {
            throw new Error(`Invalid node private key: ${error}`);
        }
        try {
            sessionKey = deserializeSessionKey(result.sessionKey);
        } catch (error: any) {
            throw new Error(`Invalid node session key: ${error}`);
        }
        try {
            hashKey = result.hashKey ? deserializeHashKey(result.hashKey) : undefined;
        } catch (error: any) {
            throw new Error(`Invalid node hash key: ${error}`);
        }

        return {
            passphrase,
            key,
            sessionKey,
            hashKey,
        };
    }
    
    return {
        setNodeKeys,
        getNodeKeys,
        removeNodeKeys,
    }
}
