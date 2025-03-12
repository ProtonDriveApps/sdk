import { EntityResult } from "./interface";
import { MemoryCache } from "./memoryCache";

describe('MemoryCache', () => {
    let cache: MemoryCache<string>;

    beforeEach(() => {
        cache = new MemoryCache();

        cache.setEntity('key1', 'value1', ['tag1:hello', 'tag2:world']);
        cache.setEntity('key2', 'value2', ['tag2:world']);
        cache.setEntity('key3', 'value3');
    });

    it('should store and retrieve an entity', async () => {
        const key = 'newkey';
        const value = 'newvalue';

        await cache.setEntity(key, value);
        const result = await cache.getEntity(key);

        expect(result).toBe(value);
    });

    it('should update an entity with tags - remove old and add new tags', async () => {
        const key = 'newkey';

        await cache.setEntity(key, 'value1', ['tag1', 'tag2']);
        await cache.setEntity(key, 'value2', ['tag2', 'tag3']);

        const result = await cache.getEntity(key);
        expect(result).toBe('value2');

        const tag1 = await Array.fromAsync(cache.iterateEntitiesByTag('tag1'));
        expect(tag1).toEqual([]);
        const tag2 = await Array.fromAsync(cache.iterateEntitiesByTag('tag2'));
        expect(tag2).toEqual([{ key, ok: true, value: 'value2' }]);
        const tag3 = await Array.fromAsync(cache.iterateEntitiesByTag('tag3'));
        expect(tag3).toEqual([{ key, ok: true, value: 'value2' }]);
    });

    it('should throw an error when retrieving a non-existing entity', async () => {
        const key = 'newkey';

        try {
            await cache.getEntity(key);
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should iterate over entities', async () => {
        const results = [];
        for await (const result of cache.iterateEntities(['key1', 'key2', 'key100'])) {
            results.push(result);
        }

        expect(results).toEqual([
            { key: 'key1', ok: true, value: 'value1' },
            { key: 'key2', ok: true, value: 'value2' },
            { key: 'key100', ok: false, error: 'Error: Entity not found' },
        ]);
    });

    it('should iterate over entities by tag', async () => {
        const results = [];
        for await (const result of cache.iterateEntitiesByTag('tag2:world')) {
            results.push(result);
        }

        expect(results).toEqual([
            { key: 'key1', ok: true, value: 'value1' },
            { key: 'key2', ok: true, value: 'value2' },
        ]);
    });

    it('should iterate over entities with multiple tags by tag', async () => {
        const results = [];
        for await (const result of cache.iterateEntitiesByTag('tag1:hello')) {
            results.push(result);
        }

        expect(results).toEqual([
            { key: 'key1', ok: true, value: 'value1' },
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
        const iterator = cache.iterateEntities(['key1', 'key2', 'key3']);
        
        const results: string[] = [];
        const { value: { key: key1 } } = await iterator.next();
        results.push(key1);
        cache.removeEntities([key1]);

        let value = await iterator.next(); // key2
        results.push(value.value.key);

        value = await iterator.next(); // key3
        results.push(value.value.key);

        expect(results).toEqual(['key1', 'key2', 'key3']);
    });

    it('should remove entities', async () => {
        await cache.removeEntities(['key1', 'key3']);

        const results = [];
        for await (const result of cache.iterateEntities(['key1', 'key2', 'key3'])) {
            results.push(result);
        }

        expect(results).toEqual([
            { key: 'key1', ok: false, error: 'Error: Entity not found' },
            { key: 'key2', ok: true, value: 'value2' },
            { key: 'key3', ok: false, error: 'Error: Entity not found' },
        ]);

        const results2 = [];
        for await (const result of cache.iterateEntitiesByTag('tag1:hello')) {
            results2.push(result);
        }
        expect(results2).toEqual([]);
    });

    it('should clear the cache', async () => {
        await cache.clear();

        const results = [];
        for await (const result of cache.iterateEntities(['key1', 'key2', 'key3'])) {
            results.push(result);
        }

        expect(results).toEqual([
            { key: 'key1', ok: false, error: 'Error: Entity not found' },
            { key: 'key2', ok: false, error: 'Error: Entity not found' },
            { key: 'key3', ok: false, error: 'Error: Entity not found' },
        ]);
    });
});
