import { ProtonDriveError } from '../errors';
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

    it('should capture loadItems failure, continue with next batches, and throw at loadRest', async () => {
        const loadItems = jest.fn((items: string[]) => {
            if (items.includes('a')) {
                return Promise.reject(new Error('loader failed'));
            }
            return Promise.resolve(items.map((item) => `loaded:${item}`));
        });

        batchLoading = new BatchLoading<string, string>({ loadItems, batchSize: 2 });

        const result: string[] = [];
        for (const item of ['a', 'b', 'c', 'd']) {
            for await (const loadedItem of batchLoading.load(item)) {
                result.push(loadedItem);
            }
        }

        let thrown: unknown;
        try {
            for await (const loadedItem of batchLoading.loadRest()) {
                result.push(loadedItem);
            }
        } catch (e) {
            thrown = e;
        }

        expect(result).toEqual(['loaded:c', 'loaded:d']);
        expect(loadItems).toHaveBeenCalledTimes(2);
        expect(thrown).toBeInstanceOf(ProtonDriveError);
        expect((thrown as ProtonDriveError).cause).toEqual([expect.objectContaining({ message: 'loader failed' })]);
    });

    it('should capture iterateItems failure, continue with next batches, and throw at loadRest', async () => {
        const iterateItems = jest.fn(async function* (items: string[]) {
            for (const item of items) {
                if (item !== 'a') {
                    yield `loaded:${item}`;
                }
            }
            if (items.includes('a')) {
                throw new Error('iterator failed');
            }
        });

        batchLoading = new BatchLoading<string, string>({ iterateItems, batchSize: 2 });

        const result: string[] = [];
        for (const item of ['a', 'b', 'c', 'd']) {
            for await (const loadedItem of batchLoading.load(item)) {
                result.push(loadedItem);
            }
        }

        let thrown: unknown;
        try {
            for await (const loadedItem of batchLoading.loadRest()) {
                result.push(loadedItem);
            }
        } catch (e) {
            thrown = e;
        }

        expect(result).toEqual(['loaded:b', 'loaded:c', 'loaded:d']);
        expect(iterateItems).toHaveBeenCalledTimes(2);
        expect(thrown).toBeInstanceOf(ProtonDriveError);
        expect((thrown as ProtonDriveError).cause).toEqual([expect.objectContaining({ message: 'iterator failed' })]);
    });

    it('should throw ProtonDriveError with causes when multiple batches fail', async () => {
        const loadItems = jest.fn((items: string[]) => {
            if (items.includes('a') || items.includes('e')) {
                return Promise.reject(new Error(`failed:${items.join(',')}`));
            }
            return Promise.resolve(items.map((item) => `loaded:${item}`));
        });

        batchLoading = new BatchLoading<string, string>({ loadItems, batchSize: 2 });

        const result: string[] = [];
        for (const item of ['a', 'b', 'c', 'd', 'e', 'f']) {
            for await (const loadedItem of batchLoading.load(item)) {
                result.push(loadedItem);
            }
        }

        let thrown: unknown;
        try {
            for await (const loadedItem of batchLoading.loadRest()) {
                result.push(loadedItem);
            }
        } catch (e) {
            thrown = e;
        }

        expect(result).toEqual(['loaded:c', 'loaded:d']);
        expect(thrown).toBeInstanceOf(ProtonDriveError);
        expect((thrown as ProtonDriveError).cause).toEqual([
            expect.objectContaining({ message: 'failed:a,b' }),
            expect.objectContaining({ message: 'failed:e,f' }),
        ]);
        expect(loadItems).toHaveBeenCalledTimes(3);
    });
});
