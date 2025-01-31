import { ProtonDriveCache } from "../../cache";
import { serializePrivateKey, deserializePrivateKey, serializeSessionKey, deserializeSessionKey, serializeHashKey, deserializeHashKey } from "../../crypto";
import { DecryptedNodeKeys } from "./interface";

/**
 * Provides caching for node crypto material.
 * 
 * The cache is responsible for serialising and deserialising node
 * crypto material.
 */
export class NodesCryptoCache {
    constructor(private driveCache: ProtonDriveCache) {
        this.driveCache = driveCache;
    }

    async setNodeKeys(nodeUid: string, keys: DecryptedNodeKeys): Promise<void> {
        const cacheUid = getCacheUid(nodeUid);
        const nodeKeysData = serializeNodeKeys(keys);
        this.driveCache.setEntity(cacheUid, nodeKeysData);
    }

    async getNodeKeys(nodeUid: string): Promise<DecryptedNodeKeys> {
        const nodeKeysData = await this.driveCache.getEntity(getCacheUid(nodeUid));
        try {
            const keys = await deserializeNodeKeys(nodeKeysData);
            return keys;
        } catch (error: unknown) {
            try {
                await this.removeNodeKeys([nodeUid]);
            } catch {
                // TODO: log error
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to deserialize node keys: ${errorMessage}`);
        }
    }

    async removeNodeKeys(nodeUids: string[]): Promise<void> {
        const cacheUids = nodeUids.map(getCacheUid);
        await this.driveCache.removeEntities(cacheUids);
    }
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
    } catch (error: unknown) {
        throw new Error(`Invalid node private key: ${error instanceof Error ? error.message : error}`);
    }
    try {
        sessionKey = deserializeSessionKey(result.sessionKey);
    } catch (error: unknown) {
        throw new Error(`Invalid node session key: ${error instanceof Error ? error.message : error}`);
    }
    try {
        hashKey = result.hashKey ? deserializeHashKey(result.hashKey) : undefined;
    } catch (error: unknown) {
        throw new Error(`Invalid node hash key: ${error instanceof Error ? error.message : error}`);
    }

    return {
        passphrase,
        key,
        sessionKey,
        hashKey,
    };
}
