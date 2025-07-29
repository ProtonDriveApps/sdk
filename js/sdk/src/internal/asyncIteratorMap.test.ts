import { asyncIteratorMap } from './asyncIteratorMap';

// Helper function to create an async generator from array
async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
    for (const item of items) {
        yield item;
    }
}

// Helper function to collect all results from async generator
async function collectResults<T>(asyncGen: AsyncGenerator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of asyncGen) {
        results.push(item);
    }
    return results;
}

describe('asyncIteratorMap', () => {
    test('works with empty input', async () => {
        const inputGen = createAsyncGenerator([]);
        const mapper = async (x: number) => x * 2;

        const mappedGen = asyncIteratorMap(inputGen, mapper);
        const results = await collectResults(mappedGen);

        expect(results).toEqual([]);
    });

    test('works with single item', async () => {
        const inputGen = createAsyncGenerator([42]);
        const mapper = async (x: number) => x * 2;

        const mappedGen = asyncIteratorMap(inputGen, mapper);
        const results = await collectResults(mappedGen);

        expect(results).toEqual([84]);
    });

    test('works with 5 values', async () => {
        const inputGen = createAsyncGenerator([1, 2, 3, 4, 5]);
        const mapper = async (x: number) => x * 2;

        const mappedGen = asyncIteratorMap(inputGen, mapper);
        const results = await collectResults(mappedGen);

        expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    test('works with slow mapper - finishes as fast as the longest delay', async () => {
        const delays: { [key: number]: number } = { 1: 100, 2: 50, 3: 200, 4: 30, 5: 80 };
        const inputGen = createAsyncGenerator(Object.keys(delays).map(Number));

        const slowMapper = async (x: number) => {
            await new Promise((resolve) => setTimeout(resolve, delays[x]));
            return x * 2;
        };

        const startTime = Date.now();
        const mappedGen = asyncIteratorMap(inputGen, slowMapper, 5);
        const results = await collectResults(mappedGen);
        const endTime = Date.now();

        // Should complete in roughly the time of the longest delay (200ms) plus some overhead
        const executionTime = endTime - startTime;
        expect(executionTime).toBeGreaterThanOrEqual(195); // We had failures with 199ms - JS is not precise.
        expect(executionTime).toBeLessThan(250);

        // Results should be in the order of the delays
        expect(results).toEqual([8, 4, 10, 2, 6]);
    });

    test('handles errors from input iterator properly', async () => {
        const throwingInputGen = async function* () {
            yield 1;
            yield 2;
            throw new Error('Error providing value: 3');
        };

        const mapper = async (x: number) => x * 2;

        const mappedGen = asyncIteratorMap(throwingInputGen(), mapper);

        const results: number[] = [];
        let caughtError: Error | null = null;

        try {
            for await (const item of mappedGen) {
                results.push(item);
            }
        } catch (error) {
            caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Error providing value: 3');
        expect(results).toEqual([2, 4]);
    });

    test('handles errors from mapper properly', async () => {
        const inputGen = createAsyncGenerator([1, 2, 3, 4, 5]);

        const throwingMapper = async (x: number) => {
            if (x === 3) {
                throw new Error(`Error processing value: ${x}`);
            }
            return x * 2;
        };

        const mappedGen = asyncIteratorMap(inputGen, throwingMapper);

        const results: number[] = [];
        let caughtError: Error | null = null;

        try {
            for await (const item of mappedGen) {
                results.push(item);
            }
        } catch (error) {
            caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Error processing value: 3');
        expect(results).toEqual([2, 4]);
    });

    test('respects concurrency limit', async () => {
        const inputGen = createAsyncGenerator([1, 2, 3, 4, 5, 6, 7, 8]);

        let concurrentExecutions = 0;
        let maxConcurrentExecutions = 0;

        const mapper = async (x: number) => {
            concurrentExecutions++;
            maxConcurrentExecutions = Math.max(maxConcurrentExecutions, concurrentExecutions);

            // Wait for 100ms to simulate work
            await new Promise((resolve) => setTimeout(resolve, 100));

            concurrentExecutions--;
            return x * 2;
        };

        const concurrencyLimit = 3;
        const mappedGen = asyncIteratorMap(inputGen, mapper, concurrencyLimit);
        const results = await collectResults(mappedGen);

        expect(maxConcurrentExecutions).toBe(concurrencyLimit);
        expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    });
});
