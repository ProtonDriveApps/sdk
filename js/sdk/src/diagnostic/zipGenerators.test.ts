import { zipGenerators } from './zipGenerators';

async function* createTimedGenerator<T>(values: { value: T; delay: number }[]): AsyncGenerator<T> {
    for (const { value, delay } of values) {
        await new Promise(resolve => setTimeout(resolve, delay));
        yield value;
    }
}

async function* createEmptyGenerator<T>(): AsyncGenerator<T> {
    return;
}

describe('zipGenerators', () => {
    it('should handle both generators being empty', async () => {
        const genA = createEmptyGenerator<string>();
        const genB = createEmptyGenerator<number>();

        const result: (string | number)[] = [];
        const zipGen = zipGenerators(genA, genB);

        for await (const value of zipGen) {
            result.push(value);
        }

        expect(result).toEqual([]);
    });

    it('should handle one generator being empty (first empty)', async () => {
        const genA = createEmptyGenerator<string>();
        const genB = createTimedGenerator([
            { value: 1, delay: 10 },
            { value: 2, delay: 10 },
        ]);

        const result: (string | number)[] = [];
        const zipGen = zipGenerators(genA, genB);

        const promise = (async () => {
            for await (const value of zipGen) {
                result.push(value);
            }
        })();

        await promise;

        expect(result).toEqual([1, 2]);
    });

    it('should handle one generator being empty (second empty)', async () => {
        const genA = createTimedGenerator([
            { value: 'a', delay: 10 },
            { value: 'b', delay: 10 },
        ]);
        const genB = createEmptyGenerator<number>();

        const result: (string | number)[] = [];
        const zipGen = zipGenerators(genA, genB);

        const promise = (async () => {
            for await (const value of zipGen) {
                result.push(value);
            }
        })();

        await promise;

        expect(result).toEqual(['a', 'b']);
    });

    it('should handle both generators with same number of elements yielded at same time', async () => {
        const genA = createTimedGenerator([
            { value: 'a1', delay: 10 },
            { value: 'a2', delay: 10 },
            { value: 'a3', delay: 10 },
        ]);
        const genB = createTimedGenerator([
            { value: 'b1', delay: 10 },
            { value: 'b2', delay: 10 },
            { value: 'b3', delay: 10 },
        ]);

        const result: string[] = [];
        const zipGen = zipGenerators(genA, genB);

        const promise = (async () => {
            for await (const value of zipGen) {
                result.push(value);
            }
        })();

        await promise;

        // Since they yield at the same time, the order depends on Promise.race behavior
        // Both values should be present, but order may vary
        expect(result).toHaveLength(6);
        expect(result).toEqual(expect.arrayContaining(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']));
    });

    it('should handle generators with different timing - first generator faster', async () => {
        const genA = createTimedGenerator([
            { value: 'fast1', delay: 10 },
            { value: 'fast2', delay: 10 },
            { value: 'fast3', delay: 10 },
        ]);
        const genB = createTimedGenerator([
            { value: 'slow1', delay: 50 },
            { value: 'slow2', delay: 50 },
        ]);

        const result: string[] = [];
        const zipGen = zipGenerators(genA, genB);

        const promise = (async () => {
            for await (const value of zipGen) {
                result.push(value);
            }
        })();

        await promise;

        expect(result).toEqual(['fast1', 'fast2', 'fast3', 'slow1', 'slow2']);
    });

    it('should handle generators with different timing - second generator faster', async () => {
        const genA = createTimedGenerator([
            { value: 'slow1', delay: 50 },
            { value: 'slow2', delay: 50 },
        ]);
        const genB = createTimedGenerator([
            { value: 'fast1', delay: 10 },
            { value: 'fast2', delay: 10 },
            { value: 'fast3', delay: 10 },
        ]);

        const result: string[] = [];
        const zipGen = zipGenerators(genA, genB);

        const promise = (async () => {
            for await (const value of zipGen) {
                result.push(value);
            }
        })();

        await promise;

        expect(result).toEqual(['fast1', 'fast2', 'fast3', 'slow1', 'slow2']);
    });

    it('should handle mixed timing with overlapping yields', async () => {
        const genA = createTimedGenerator([
            { value: 'A1', delay: 50 },
            { value: 'A2', delay: 100 },
            { value: 'A3', delay: 100 },
        ]);
        const genB = createTimedGenerator([
            { value: 'B1', delay: 100 },
            { value: 'B2', delay: 100 },
            { value: 'B3', delay: 200 },
        ]);

        const result: string[] = [];
        const timestamps: number[] = [];
        const zipGen = zipGenerators(genA, genB);

        const promise = (async () => {
            for await (const value of zipGen) {
                result.push(value);
                timestamps.push(Date.now());
            }
        })();

        await promise;

        expect(result).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
    });
});
