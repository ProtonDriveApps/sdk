import { BatchLoading } from './batchLoading';

describe('BatchLoading', () => {
    let batchLoading: BatchLoading<string, string>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should load in batches with loadItems', async () => {
        const loadItems = jest.fn((items: string[]) => Promise.resolve(items.map((item) => `loaded:${item}`)));

        batchLoading = new BatchLoading<string, string>({ loadItems, batchSize: 2 });

        const result = [];
        for (const item of ['a', 'b', 'c', 'd', 'e']) {
            for await (const loadedItem of batchLoading.load(item)) {
                result.push(loadedItem);
            }
        }
        for await (const loadedItem of batchLoading.loadRest()) {
            result.push(loadedItem);
        }

        expect(result).toEqual(['loaded:a', 'loaded:b', 'loaded:c', 'loaded:d', 'loaded:e']);
        expect(loadItems).toHaveBeenCalledTimes(3);
        expect(loadItems).toHaveBeenNthCalledWith(1, ['a', 'b']);
        expect(loadItems).toHaveBeenNthCalledWith(2, ['c', 'd']);
        expect(loadItems).toHaveBeenNthCalledWith(3, ['e']);
    });

    it('should load in batches with iterateItems', async () => {
        const iterateItems = jest.fn(async function* (items: string[]) {
            for (const item of items) {
                yield `loaded:${item}`;
            }
        });

        batchLoading = new BatchLoading<string, string>({ iterateItems, batchSize: 2 });

        const result = [];
        for (const item of ['a', 'b', 'c', 'd', 'e']) {
            for await (const loadedItem of batchLoading.load(item)) {
                result.push(loadedItem);
            }
        }
        for await (const loadedItem of batchLoading.loadRest()) {
            result.push(loadedItem);
        }

        expect(result).toEqual(['loaded:a', 'loaded:b', 'loaded:c', 'loaded:d', 'loaded:e']);
        expect(iterateItems).toHaveBeenCalledTimes(3);
        expect(iterateItems).toHaveBeenNthCalledWith(1, ['a', 'b']);
        expect(iterateItems).toHaveBeenNthCalledWith(2, ['c', 'd']);
        expect(iterateItems).toHaveBeenNthCalledWith(3, ['e']);
    });
});
