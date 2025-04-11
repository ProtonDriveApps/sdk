export class ChunkStreamReader {
    private reader: ReadableStreamDefaultReader<Uint8Array>;

    private chunkSize: number;

    constructor(stream: ReadableStream<Uint8Array>, chunkSize: number) {
        this.reader = stream.getReader();
        this.chunkSize = chunkSize;
    }

    async *iterateChunks() {
        let buffer = new Uint8Array(this.chunkSize);

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

                buffer = new Uint8Array(this.chunkSize);
                position = 0;
                remainingValue = remainingValue.slice(remainingToFillBuffer);
            }
        }

        if (position > 0) {
            yield buffer.slice(0, position);
        }
    }
}
