import { PrivateKey, SessionKey } from "../../crypto";
import { MemoryCache } from "../../cache";
import { NodesCryptoCache } from "./cryptoCache";

jest.mock('../../crypto/openPGPSerialisation', () => ({
    serializePrivateKey: jest.fn((value) => value),
    deserializePrivateKey: jest.fn((value) => value),
    serializeSessionKey: jest.fn((value) => value),
    deserializeSessionKey: jest.fn((value) => {
        if (value === 'badSessionKey') {
            throw new Error('Bad session key');
        }
        return value;
    }),
}));

describe('nodesCryptoCache', () => {
    let memoryCache: MemoryCache;
    let cache: NodesCryptoCache;

    const generatePrivateKey = (name: string) => {
        return name as unknown as PrivateKey
    }

    const generateSessionKey = (name: string) => {
        return name as unknown as SessionKey
    }

    beforeEach(() => {
        memoryCache = new MemoryCache([]);
        memoryCache.setEntity('nodeKeys-badKeysObject', 'aaa');
        memoryCache.setEntity('nodeKeys-badSessionKey', '{ "passphrase": "pass", "key": "aaa", "sessionKey": "badSessionKey" }');

        cache = new NodesCryptoCache(memoryCache);
    });

    it('should store and retrieve keys', async () => {
        const nodeId = 'newNodeId';
        const keys = { passphrase: 'pass', key: generatePrivateKey('privateKey'), sessionKey: generateSessionKey('sessionKey'), hashKey: undefined };

        await cache.setNodeKeys(nodeId, keys);
        const result = await cache.getNodeKeys(nodeId);

        expect(result).toStrictEqual(keys);
    });

    it('should replace and retrieve new keys', async () => {
        const nodeId = 'newNodeId';
        const keys1 = { passphrase: 'pass', key: generatePrivateKey('privateKey1'), sessionKey: generateSessionKey('sessionKey1'), hashKey: undefined };
        const keys2 = { passphrase: 'pass', key: generatePrivateKey('privateKey2'), sessionKey: generateSessionKey('sessionKey2'), hashKey: undefined };

        await cache.setNodeKeys(nodeId, keys1);
        await cache.setNodeKeys(nodeId, keys2);
        const result = await cache.getNodeKeys(nodeId);

        expect(result).toStrictEqual(keys2);
    });

    it('should remove keys', async () => {
        const nodeId = 'newNodeId';
        const keys = { passphrase: 'pass', key: generatePrivateKey('privateKey'), sessionKey: generateSessionKey('sessionKey'), hashKey: undefined };

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
            await cache.getNodeKeys('badKeysObject');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialize node keys: Unexpected token \'a\', \"aaa\" is not valid JSON');
        }

        try {
            await memoryCache.getEntity('nodeKeys-badKeysObject');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a bad session key and remove the key', async () => {
        try {
            await cache.getNodeKeys('badSessionKey');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialize node keys: Invalid node session key: Bad session key');
        }

        try {
            await memoryCache.getEntity('nodeKeys-badSessingKey');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });
});