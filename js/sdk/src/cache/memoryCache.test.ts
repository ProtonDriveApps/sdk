import { MemoryCache } from "./memoryCache";

describe('MemoryCache', () => {
    let cache: MemoryCache<string>;

    beforeEach(() => {
        cache = new MemoryCache();

        cache.setEntity('uid1', 'data1', ['tag1:hello', 'tag2:world']);
        cache.setEntity('uid2', 'data2', ['tag2:world']);
        cache.setEntity('uid3', 'data3');
    });

    it('should store and retrieve an entity', async () => {
        const uid = 'newuid';
        const data = 'newdata';

        await cache.setEntity(uid, data);
        const result = await cache.getEntity(uid);

        expect(result).toBe(data);
    });

    it('should throw an error when retrieving a non-existing entity', async () => {
        const uid = 'newuid';

        try {
            await cache.getEntity(uid);
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should iterate over entities', async () => {
        const results = [];
        for await (const result of cache.iterateEntities(['uid1', 'uid2', 'uid100'])) {
            results.push(result);
        }

        expect(results).toEqual([
            { uid: 'uid1', ok: true, data: 'data1' },
            { uid: 'uid2', ok: true, data: 'data2' },
            { uid: 'uid100', ok: false, error: 'Error: Entity not found' },
        ]);
    });

    it('should iterate over entities by tag', async () => {
        const results = [];
        for await (const result of cache.iterateEntitiesByTag('tag2:world')) {
            results.push(result);
        }

        expect(results).toEqual([
            { uid: 'uid1', ok: true, data: 'data1' },
            { uid: 'uid2', ok: true, data: 'data2' },
        ]);
    });

    it('should iterate over entities with multiple tags by tag', async () => {
        const results = [];
        for await (const result of cache.iterateEntitiesByTag('tag1:hello')) {
            results.push(result);
        }

        expect(results).toEqual([
            { uid: 'uid1', ok: true, data: 'data1' },
        ]);
    });

    it('should iterate over entities by empty tag', async () => {
        const results = [];
        for await (const result of cache.iterateEntitiesByTag('nonexistent')) {
            results.push(result);
        }

        expect(results).toEqual([]);
    });

    it('should iterate over entities with concurrent changes to the same set', async () => {
        const iterator = cache.iterateEntities(['uid1', 'uid2', 'uid3']);
        
        const results: string[] = [];
        const { value: { uid: uid1 } } = await iterator.next();
        results.push(uid1);
        cache.removeEntities([uid1]);

        let value = await iterator.next(); // uid2
        results.push(value.value.uid);

        value = await iterator.next(); // uid3
        results.push(value.value.uid);

        expect(results).toEqual(['uid1', 'uid2', 'uid3']);
    });

    it('should remove entities', async () => {
        await cache.removeEntities(['uid1', 'uid3']);

        const results = [];
        for await (const result of cache.iterateEntities(['uid1', 'uid2', 'uid3'])) {
            results.push(result);
        }

        expect(results).toEqual([
            { uid: 'uid1', ok: false, error: 'Error: Entity not found' },
            { uid: 'uid2', ok: true, data: 'data2' },
            { uid: 'uid3', ok: false, error: 'Error: Entity not found' },
        ]);

        const results2 = [];
        for await (const result of cache.iterateEntitiesByTag('tag1:hello')) {
            results2.push(result);
        }
        expect(results2).toEqual([]);
    });

    it('should purge the cache', async () => {
        await cache.purge();

        const results = [];
        for await (const result of cache.iterateEntities(['uid1', 'uid2', 'uid3'])) {
            results.push(result);
        }

        expect(results).toEqual([
            { uid: 'uid1', ok: false, error: 'Error: Entity not found' },
            { uid: 'uid2', ok: false, error: 'Error: Entity not found' },
            { uid: 'uid3', ok: false, error: 'Error: Entity not found' },
        ]);
    });
});
