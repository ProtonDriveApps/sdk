import { PrivateKey, SessionKey } from '../../crypto';
import { MemoryCache } from '../../cache';
import { CachedCryptoMaterial } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { NodesCryptoCache } from './cryptoCache';

describe('nodesCryptoCache', () => {
    let memoryCache: MemoryCache<CachedCryptoMaterial>;
    let cache: NodesCryptoCache;

    const generatePrivateKey = (name: string) => {
        return name as unknown as PrivateKey;
    };

    const generateSessionKey = (name: string) => {
        return name as unknown as SessionKey;
    };

    beforeEach(async () => {
        memoryCache = new MemoryCache();
        await memoryCache.setEntity('nodeKeys-missingProperties', {} as any);

        cache = new NodesCryptoCache(getMockLogger(), memoryCache);
    });

    it('should store and retrieve keys', async () => {
        const nodeId = 'newNodeId';
        const keys = {
            passphrase: 'pass',
            key: generatePrivateKey('privateKey'),
            passphraseSessionKey: generateSessionKey('sessionKey'),
            hashKey: undefined,
        };

        await cache.setNodeKeys(nodeId, keys);
        const result = await cache.getNodeKeys(nodeId);

        expect(result).toStrictEqual(keys);
    });

    it('should replace and retrieve new keys', async () => {
        const nodeId = 'newNodeId';
        const keys1 = {
            passphrase: 'pass',
            key: generatePrivateKey('privateKey1'),
            passphraseSessionKey: generateSessionKey('sessionKey1'),
            hashKey: undefined,
        };
        const keys2 = {
            passphrase: 'pass',
            key: generatePrivateKey('privateKey2'),
            passphraseSessionKey: generateSessionKey('sessionKey2'),
            hashKey: undefined,
        };

        await cache.setNodeKeys(nodeId, keys1);
        await cache.setNodeKeys(nodeId, keys2);
        const result = await cache.getNodeKeys(nodeId);

        expect(result).toStrictEqual(keys2);
    });

    it('should remove keys', async () => {
        const nodeId = 'newNodeId';
        const keys = {
            passphrase: 'pass',
            key: generatePrivateKey('privateKey'),
            passphraseSessionKey: generateSessionKey('sessionKey'),
            hashKey: undefined,
        };

        await cache.setNodeKeys(nodeId, keys);
        await cache.removeNodeKeys([nodeId]);

        try {
            await cache.getNodeKeys(nodeId);
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a non-existing entity', async () => {
        const nodeId = 'newNodeId';

        try {
            await cache.getNodeKeys(nodeId);
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a bad keys and remove the key', async () => {
        try {
            await cache.getNodeKeys('missingProperties');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialize node keys');
        }

        try {
            await memoryCache.getEntity('nodeKeys-missingProperties');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });
});
