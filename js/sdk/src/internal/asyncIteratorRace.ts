const DEFAULT_CONCURRENCY = 10;

/**
 * Races multiple async iterators into a single async iterator.
 *
 * The input iterators are provided as an async iterator that yields async
 * iterators. This allows to create the iterators lazily, e.g., when the
 * input iterators are created from a database query.
 *
 * The number of input iterators being read at the same time is limited by
 * the `concurrency` parameter.
 *
 * Any error from the input iterators is propagated to the output iterator.
 */
export async function* asyncIteratorRace<T>(
    inputIterators: AsyncGenerator<AsyncGenerator<T>>,
    concurrency: number = DEFAULT_CONCURRENCY,
): AsyncGenerator<T> {
    const promises = new Map<
        number,
        Promise<{
            iteratorIndex: number;
            result: IteratorResult<T>;
        }>
    >();

    let nextIteratorIndex = 0;
    let inputIteratorsExhausted = false;
    const activeIterators = new Map<number, AsyncGenerator<T>>();

    const startNewIterator = async (): Promise<void> => {
        if (inputIteratorsExhausted || activeIterators.size >= concurrency) {
            return;
        }

        const nextIteratorResult = await inputIterators.next();
        if (nextIteratorResult.done) {
            inputIteratorsExhausted = true;
            return;
        }

        const iterator = nextIteratorResult.value;
        const iteratorIndex = nextIteratorIndex++;
        activeIterators.set(iteratorIndex, iterator);

        promises.set(
            iteratorIndex,
            (async () => {
                const result = await iterator.next();
                return { iteratorIndex, result };
            })(),
        );
    };

    while (activeIterators.size < concurrency && !inputIteratorsExhausted) {
        await startNewIterator();
    }

    while (promises.size > 0) {
        const { iteratorIndex, result } = await Promise.race(promises.values());
        promises.delete(iteratorIndex);

        if (result.done) {
            activeIterators.delete(iteratorIndex);
            await startNewIterator();
        } else {
            yield result.value;

            const iterator = activeIterators.get(iteratorIndex)!;
            promises.set(
                iteratorIndex,
                (async () => {
                    const result = await iterator.next();
                    return { iteratorIndex, result };
                })(),
            );
        }
    }
}
