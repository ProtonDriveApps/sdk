/**
 * This class is used to read a stream in chunks.
 *
 * WARNING: The chunks are reused to avoid allocating new memory for each chunk.
 * Ensure that the previous chunk is fully read before reading the next chunk.
 * If you need to keep previous chunks, copy them to a new array.
 */
export class ChunkStreamReader {
    private reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;

    private chunkSize: number;

    private signal?: AbortSignal;

    constructor(stream: ReadableStream<Uint8Array<ArrayBuffer>>, chunkSize: number, signal?: AbortSignal) {
        this.reader = stream.getReader();
        this.chunkSize = chunkSize;
        this.signal = signal;
    }

    async *iterateChunks(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
        const buffer = new Uint8Array(this.chunkSize);

        // Cancelling resolves any pending read as done, so the iteration
        // ends even if the stream would not provide more data. Cancel can
        // only fail if the stream is errored, which the read surfaces.
        const cancelOnAbort = () => {
            this.reader.cancel().catch(() => {});
        };
        if (this.signal?.aborted) {
            cancelOnAbort();
        } else {
            this.signal?.addEventListener('abort', cancelOnAbort, { once: true });
        }

        let position = 0;
        let isStreamFinished = false;
        try {
            while (true) {
                const { done, value } = await this.reader.read();
                if (done) {
                    isStreamFinished = true;
                    break;
                }

                let remainingValue = value;
                while (remainingValue.length > 0) {
                    if (position + remainingValue.length < this.chunkSize) {
                        buffer.set(remainingValue, position);
                        position += remainingValue.length;
                        break;
                    }

                    const remainingToFillBuffer = this.chunkSize - position;
                    buffer.set(remainingValue.slice(0, remainingToFillBuffer), position);
                    yield buffer;

                    position = 0;
                    remainingValue = remainingValue.slice(remainingToFillBuffer);
                }
            }

            if (position > 0) {
                yield buffer.slice(0, position);
            }
        } finally {
            this.signal?.removeEventListener('abort', cancelOnAbort);

            // Stopping before the end of the stream (consumer breaks out
            // or throws) must release the underlying resource, such as
            // an open file handle.
            if (!isStreamFinished) {
                await this.reader.cancel().catch(() => {});
            }
        }
    }
}
