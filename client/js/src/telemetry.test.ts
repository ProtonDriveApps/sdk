import { reduceSizePrecision } from './telemetry';

describe('reduceSizePrecision', () => {
    it('returns 0 for size 0', () => {
        expect(reduceSizePrecision(0)).toBe(0);
    });

    it('returns 4095 for very small files (size < 4096)', () => {
        expect(reduceSizePrecision(1)).toBe(4095);
        expect(reduceSizePrecision(100)).toBe(4095);
        expect(reduceSizePrecision(4095)).toBe(4095);
    });

    it('returns precision (100_000) for sizes from 4096 to below precision', () => {
        expect(reduceSizePrecision(4096)).toBe(100_000);
        expect(reduceSizePrecision(50_000)).toBe(100_000);
        expect(reduceSizePrecision(99_999)).toBe(100_000);
    });

    it('returns size unchanged when size equals precision', () => {
        expect(reduceSizePrecision(100_000)).toBe(100_000);
    });

    it('rounds down to nearest 100_000 for sizes above precision', () => {
        expect(reduceSizePrecision(100_001)).toBe(100_000);
        expect(reduceSizePrecision(150_000)).toBe(100_000);
        expect(reduceSizePrecision(199_999)).toBe(100_000);
        expect(reduceSizePrecision(200_000)).toBe(200_000);
        expect(reduceSizePrecision(250_000)).toBe(200_000);
        expect(reduceSizePrecision(299_999)).toBe(200_000);
        expect(reduceSizePrecision(300_000)).toBe(300_000);
    });

    it('handles large sizes', () => {
        expect(reduceSizePrecision(1_000_000)).toBe(1_000_000);
        expect(reduceSizePrecision(1_500_000)).toBe(1_500_000);
        expect(reduceSizePrecision(1_999_999)).toBe(1_900_000);
        expect(reduceSizePrecision(10_000_000)).toBe(10_000_000);
    });
});
