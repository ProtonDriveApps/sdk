import { batch } from './batch';

describe('batch', () => {
    it('should batch an array of numbers into chunks of specified size', () => {
        const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const batchSize = 3;
        const result = Array.from(batch(items, batchSize));

        expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });

    it('should handle batch size equal to array length', () => {
        const items = [1, 2, 3, 4, 5];
        const batchSize = 5;
        const result = Array.from(batch(items, batchSize));

        expect(result).toEqual([[1, 2, 3, 4, 5]]);
    });

    it('should handle batch size larger than array length', () => {
        const items = [1, 2, 3];
        const batchSize = 10;
        const result = Array.from(batch(items, batchSize));

        expect(result).toEqual([[1, 2, 3]]);
    });

    it('should handle batch size of 1', () => {
        const items = [1, 2, 3];
        const batchSize = 1;
        const result = Array.from(batch(items, batchSize));

        expect(result).toEqual([[1], [2], [3]]);
    });

    it('should handle empty array', () => {
        const items: number[] = [];
        const batchSize = 3;
        const result = Array.from(batch(items, batchSize));

        expect(result).toEqual([]);
    });

    it('should handle zero batch size gracefully', () => {
        const items = [1, 2, 3];
        const batchSize = 0;

        expect(() => Array.from(batch(items, batchSize))).toThrow();
    });
});
