import { getVerifierFileSizeBucket } from './verifierFileSizeBucket';

describe('getVerifierFileSizeBucket', () => {
    it('maps sizes to the smallest bucket that fits', () => {
        expect(getVerifierFileSizeBucket(0)).toBe('2**10');
        expect(getVerifierFileSizeBucket(1 << 10)).toBe('2**10');
        expect(getVerifierFileSizeBucket((1 << 10) + 1)).toBe('2**20');
        expect(getVerifierFileSizeBucket(1 << 20)).toBe('2**20');
        expect(getVerifierFileSizeBucket((1 << 22) + 1)).toBe('2**25');
        expect(getVerifierFileSizeBucket(1 << 30)).toBe('2**30');
        expect(getVerifierFileSizeBucket((1 << 30) + 1)).toBe('xxxxl');
    });
});
