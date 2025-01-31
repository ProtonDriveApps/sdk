import { PrivateKey, SessionKey } from "../../crypto";
import { MemoryCache } from "../../cache";
import { sharesCryptoCache } from "./cryptoCache";

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

describe('sharesCryptoCache', () => {
    let memoryCache: MemoryCache;
    let cache: ReturnType<typeof sharesCryptoCache>;

    const generatePrivateKey = (name: string) => {
        return name as unknown as PrivateKey
    }

    const generateSessionKey = (name: string) => {
        return name as unknown as SessionKey
    }

    beforeEach(() => {
        memoryCache = new MemoryCache([]);
        memoryCache.setEntity('shareKey-badKeysObject', 'aaa');
        memoryCache.setEntity('shareKey-badSessionKey', '{ "key": "aaa", "sessionKey": "badSessionKey" }');

        cache = sharesCryptoCache(memoryCache);
    });

    it('should store and retrieve keys', async () => {
        const shareId = 'newShareId';
        const keys = { key: generatePrivateKey('privateKey'), sessionKey: generateSessionKey('sessionKey') };

        await cache.setShareKey(shareId, keys);
        const result = await cache.getShareKey(shareId);

        expect(result).toStrictEqual(keys);
    });

    it('should replace and retrieve new keys', async () => {
        const shareId = 'newShareId';
        const keys1 = { key: generatePrivateKey('privateKey1'), sessionKey: generateSessionKey('sessionKey1') };
        const keys2 = { key: generatePrivateKey('privateKey2'), sessionKey: generateSessionKey('sessionKey2') };

        await cache.setShareKey(shareId, keys1);
        await cache.setShareKey(shareId, keys2);
        const result = await cache.getShareKey(shareId);

        expect(result).toStrictEqual(keys2);
    });

    it('should remove keys', async () => {
        const shareId = 'newShareId';
        const keys = { key: generatePrivateKey('privateKey'), sessionKey: generateSessionKey('sessionKey') };

        await cache.setShareKey(shareId, keys);
        await cache.removeShareKey([shareId]);

        try {
            await cache.getShareKey(shareId);
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a non-existing entity', async () => {
        const shareId = 'newShareId';

        try {
            await cache.getShareKey(shareId);
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a bad keys and remove the key', async () => {
        try {
            await cache.getShareKey('badKeysObject');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialize share keys: Unexpected token \'a\', \"aaa\" is not valid JSON');
        }

        try {
            await memoryCache.getEntity('shareKey-badKeysObject');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a bad session key and remove the key', async () => {
        try {
            await cache.getShareKey('badSessionKey');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialize share keys: Invalid share session key: Error: Bad session key');
        }

        try {
            await memoryCache.getEntity('shareKey-badSessingKey');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });
});