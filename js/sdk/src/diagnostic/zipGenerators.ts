/**
 * Zips two generators into one.
 *
 * The combined generator yields values from both generators in the order they
 * are produced.
 */
export async function* zipGenerators<T, U>(
    genA: AsyncGenerator<T>,
    genB: AsyncGenerator<U>,
    options?: {
        stopOnFirstDone?: boolean
    },
): AsyncGenerator<T | U> {
    const { stopOnFirstDone = false } = options || {};

    const itA = genA[Symbol.asyncIterator]();
    const itB = genB[Symbol.asyncIterator]();

    let promiseA: Promise<IteratorResult<T>> | undefined = itA.next();
    let promiseB: Promise<IteratorResult<U>> | undefined = itB.next();

    while (promiseA && promiseB) {
        const result = await Promise.race([
            promiseA.then(res => ({ source: 'A' as const, result: res })),
            promiseB.then(res => ({ source: 'B' as const, result: res }))
        ]);

        if (result.source === 'A') {
            if (result.result.done) {
                promiseA = undefined;
                if (stopOnFirstDone) {
                    break;
                }
            } else {
                yield result.result.value;
                promiseA = itA.next();
            }
        } else {
            if (result.result.done) {
                promiseB = undefined;
                if (stopOnFirstDone) {
                    break;
                }
            } else {
                yield result.result.value;
                promiseB = itB.next();
            }
        }
    }

    if (stopOnFirstDone) {
        return;
    }

    if (promiseA) {
        const result = await promiseA;
        if (!result.done) {
            yield result.value;
        }
        yield* itA;
    }

    if (promiseB) {
        const result = await promiseB;
        if (!result.done) {
            yield result.value;
        }
        yield* itB;
    }
}
