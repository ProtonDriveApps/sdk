import { PrivateKey, SessionKey } from '../../crypto';
import { MemoryCache } from '../../cache';
import { CachedCryptoMaterial } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { SharesCryptoCache } from './cryptoCache';

describe('sharesCryptoCache', () => {
    let memoryCache: MemoryCache<CachedCryptoMaterial>;
    let cache: SharesCryptoCache;

    const generatePrivateKey = (name: string) => {
        return name as unknown as PrivateKey;
    };

    const generateSessionKey = (name: string) => {
        return name as unknown as SessionKey;
    };

    beforeEach(() => {
        memoryCache = new MemoryCache();
        cache = new SharesCryptoCache(getMockLogger(), memoryCache);
    });

    it('should store and retrieve keys', async () => {
        const shareId = 'newShareId';
        const keys = { key: generatePrivateKey('privateKey'), passphraseSessionKey: generateSessionKey('sessionKey') };

        await cache.setShareKey(shareId, keys);
        const result = await cache.getShareKey(shareId);

        expect(result).toStrictEqual(keys);
    });

    it('should replace and retrieve new keys', async () => {
        const shareId = 'newShareId';
        const keys1 = {
            key: generatePrivateKey('privateKey1'),
            passphraseSessionKey: generateSessionKey('sessionKey1'),
        };
        const keys2 = {
            key: generatePrivateKey('privateKey2'),
            passphraseSessionKey: generateSessionKey('sessionKey2'),
        };

        await cache.setShareKey(shareId, keys1);
        await cache.setShareKey(shareId, keys2);
        const result = await cache.getShareKey(shareId);

        expect(result).toStrictEqual(keys2);
    });

    it('should remove keys', async () => {
        const shareId = 'newShareId';
        const keys = { key: generatePrivateKey('privateKey'), passphraseSessionKey: generateSessionKey('sessionKey') };

        await cache.setShareKey(shareId, keys);
        await cache.removeShareKeys([shareId]);

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
});
