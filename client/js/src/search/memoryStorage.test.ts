import { createMemoryStorage } from './memoryStorage';

describe('createMemoryStorage', () => {
    it('stores, loads and removes values by key', async () => {
        const storage = createMemoryStorage();
        const value = new Uint8Array([1, 2, 3]);

        await storage.store({ inner: 'a' }, value);
        expect(await storage.load({ inner: 'a' })).toBe(value);

        await storage.remove({ inner: 'a' });
        expect(await storage.load({ inner: 'a' })).toBeNull();
    });

    it('removes all values', async () => {
        const storage = createMemoryStorage();
        await storage.store({ inner: 'a' }, new Uint8Array([1]));
        await storage.store({ inner: 'b' }, new Uint8Array([2]));

        await storage.removeAll();

        expect(await storage.load({ inner: 'a' })).toBeNull();
        expect(await storage.load({ inner: 'b' })).toBeNull();
    });

    it('keeps separate instances isolated', async () => {
        const first = createMemoryStorage();
        const second = createMemoryStorage();
        await first.store({ inner: 'a' }, new Uint8Array([1]));

        expect(await second.load({ inner: 'a' })).toBeNull();
    });
});
