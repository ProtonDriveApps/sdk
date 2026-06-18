export function* batch<T>(items: T[], batchSize: number): Generator<T[]> {
    if (batchSize <= 0) {
        throw new Error('Batch size must be greater than 0');
    }

    for (let i = 0; i < items.length; i += batchSize) {
        yield items.slice(i, i + batchSize);
    }
}
