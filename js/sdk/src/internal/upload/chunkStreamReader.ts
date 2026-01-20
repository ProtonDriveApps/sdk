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

    constructor(stream: ReadableStream<Uint8Array<ArrayBuffer>>, chunkSize: number) {
        this.reader = stream.getReader();
        this.chunkSize = chunkSize;
    }

    async *iterateChunks(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
        const buffer = new Uint8Array(this.chunkSize);

        let position = 0;
        while (true) {
            const { done, value } = await this.reader.read();
            if (done) {
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
    }
}
