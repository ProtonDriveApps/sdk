const DEFAULT_CONCURRENCY = 10;

/**
 * Maps values from an input iterator and produces a new iterator.
 * The mapper function is not awaited immediately to allow for parallel
 * execution. The order of the items in the output iterator is not the
 * same as the order of the items in the input iterator.
 *
 * Any error from the input iterator or the mapper function is propagated
 * to the output iterator.
 * 
 * @param inputIterator - The input async iterator.
 * @param mapper - The mapper function that maps the input values to output values.
 * @param concurrency - The concurrency limit. How many parallel async mapper calls are allowed.
 * @returns An async iterator that yields the mapped values.
 */
export async function* asyncIteratorMap<I, O>(
    inputIterator: AsyncGenerator<I>,
    mapper: (item: I) => Promise<O>,
    concurrency: number = DEFAULT_CONCURRENCY,
): AsyncGenerator<O> {
    let done = false;

    const executing = new Set<Promise<void>>();
    const results: Array<Promise<O>> = [];

    const pump = async () => {
        let next;
        try {
            next = await inputIterator.next();
        } catch (error) {
            results.push(Promise.reject(error));
            return;
        }

        if (next.done) {
            done = true;
            return;
        }

        const promise = mapper(next.value)
            .then((result) => {
                results.push(Promise.resolve(result));
            })
            .catch((error) => {
                results.push(Promise.reject(error));
            });
        executing.add(promise);
        void promise.finally(() => executing.delete(promise));
    };

    while (!done || executing.size > 0 || results.length > 0) {
        while (!done && executing.size < concurrency) {
            await pump();
        }

        if (results.length > 0) {
            yield await results.shift()!;
        } else if (executing.size > 0) {
            // Wait for at least one task to complete
            await Promise.race(Array.from(executing));
        }
    }
}
