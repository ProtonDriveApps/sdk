import { MemoryCache } from "../../cache";
import { getMockLogger } from "../../tests/logger";
import { SharesCache } from "./cache";

describe('sharesCache', () => {
    let memoryCache: MemoryCache<string>;
    let cache: SharesCache;

    beforeEach(async () => {
        memoryCache = new MemoryCache();
        await memoryCache.setEntity('volume-badObject', 'aaa');

        cache = new SharesCache(getMockLogger(), memoryCache);
    });

    it('should store and retrieve volume', async () => {
        const volumeId = 'volume1';
        const volume = {
            volumeId,
            shareId: 'share1',
            rootNodeId: 'node1',
            creatorEmail: 'email',
            addressId: 'address1',
        };

        await cache.setVolume(volume);
        const result = await cache.getVolume(volumeId);

        expect(result).toStrictEqual(volume);
    });

    it('should throw an error when retrieving a non-existing entity', async () => {
        const volumeId = 'newVolumeId';

        try {
            await cache.getVolume(volumeId);
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a bad keys and remove the key', async () => {
        try {
            await cache.getVolume('badObject');
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialize volume: Unexpected token \'a\', \"aaa\" is not valid JSON');
        }

        try {
            await memoryCache.getEntity('volumes-badObject');
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });
});
