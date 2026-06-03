export type VerifierFileSizeBucket = '2**10' | '2**20' | '2**22' | '2**25' | '2**30' | 'xxxxl';

const FILE_SIZE_BUCKETS: { max: number; label: VerifierFileSizeBucket }[] = [
    { max: 1 << 10, label: '2**10' },
    { max: 1 << 20, label: '2**20' },
    { max: 1 << 22, label: '2**22' },
    { max: 1 << 25, label: '2**25' },
    { max: 1 << 30, label: '2**30' },
];

export function getVerifierFileSizeBucket(size: number): VerifierFileSizeBucket {
    for (const bucket of FILE_SIZE_BUCKETS) {
        if (size <= bucket.max) {
            return bucket.label;
        }
    }
    return 'xxxxl';
}
