export interface UnderlyingSeekableSource extends UnderlyingDefaultSource<Uint8Array> {
    seek: (position: number) => void | Promise<void>;
}

/**
 * A seekable readable stream that can be used to seek to a specific position
 * in the stream.
 *
 * This is useful for downloading the file in chunks or jumping to a specific
 * position in the file when streaming a video.
 *
 * Example to get next chunk of data from the stream at position 100:
 *
 * ```
 * const stream = new SeekableReadableStream(underlyingSource);
 * const reader = stream.getReader();
 * await stream.seek(100);
 * const data = await stream.read();
 * console.log(data);
 * ```
 */
export class SeekableReadableStream extends ReadableStream<Uint8Array> {
    private seekCallback: (position: number) => void | Promise<void>;

    constructor(
        { seek, ...underlyingSource }: UnderlyingSeekableSource,
        queuingStrategy?: QueuingStrategy<Uint8Array>,
    ) {
        super(underlyingSource, queuingStrategy);
        this.seekCallback = seek;
    }

    seek(position: number): void | Promise<void> {
        return this.seekCallback(position);
    }
}

/**
 * A buffered seekable stream that allows to seek and read specific number of
 * bytes from the stream.
 *
 * This is useful for reading specific range of data from the stream. Example
 * being video player buffering the next several bytes.
 *
 * The underlying source can chunk the data into various sizes. To ensure that
 * every read operation is for the correct location, the SeekableStream is not
 * queueing the data upfront. Instead, it will read the data and buffer it for
 * the next read operation. If seek is called, the internal buffer is updated
 * accordingly.
 *
 * Example to read 10 bytes from the stream at position 100:
 *
 * ```
 * const stream = new BufferedSeekableStream(underlyingSource);
 * await stream.seek(100);
 * const data = await stream.read(10);
 * console.log(data);
 * ```
 */
export class BufferedSeekableStream extends SeekableReadableStream {
    private buffer: Uint8Array = new Uint8Array(0);
    private bufferPosition: number = 0;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private streamClosed: boolean = false;
    private currentPosition: number = 0;

    constructor(underlyingSource: UnderlyingSeekableSource, queuingStrategy?: QueuingStrategy<Uint8Array>) {
        // highWaterMark means that the stream will buffer up to this many
        // bytes. We do not want to buffer anything
        if (queuingStrategy && queuingStrategy.highWaterMark !== 0) {
            throw new Error('highWaterMark must be 0');
        }

        super(underlyingSource, {
            ...queuingStrategy,
            highWaterMark: 0,
        });

        this.reader = super.getReader();
    }

    /**
     * Read a specific number of bytes from the stream.
     *
     * When the underlying source provides more bytes than requested, the
     * remaining bytes are buffered and used for the next read operation.
     *
     * @param numBytes - Number of bytes to read
     * @returns Promise<Uint8Array> The read bytes
     */
    async read(numBytes: number): Promise<{ value: Uint8Array; done: boolean }> {
        if (numBytes <= 0) {
            throw new Error('Invalid number of bytes to read');
        }

        await this.ensureBufferSize(numBytes);

        const result = this.buffer.slice(this.bufferPosition, this.bufferPosition + numBytes);
        this.bufferPosition += numBytes;
        this.currentPosition += numBytes;
        return {
            value: result,
            done: this.streamClosed,
        };
    }

    private async ensureBufferSize(minBytes: number): Promise<void> {
        const availableBytes = this.buffer.length - this.bufferPosition;
        const neededBytes = minBytes - availableBytes;

        if (neededBytes <= 0 || this.streamClosed) {
            return;
        }

        const chunks: Uint8Array[] = [];
        let totalBytesRead = 0;

        while (totalBytesRead < neededBytes && !this.streamClosed) {
            if (!this.reader) {
                throw new Error('Stream reader is not available');
            }

            const { done, value } = await this.reader.read();

            if (done) {
                this.streamClosed = true;
                break;
            }

            if (value) {
                chunks.push(value);
                totalBytesRead += value.length;
            }
        }

        if (chunks.length > 0) {
            // Create new buffer with existing unused data plus new chunks
            const unusedBufferData = this.buffer.slice(this.bufferPosition);
            const newTotalLength = unusedBufferData.length + totalBytesRead;
            const newBuffer = new Uint8Array(newTotalLength);

            newBuffer.set(unusedBufferData, 0);
            let offset = unusedBufferData.length;
            for (const chunk of chunks) {
                newBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            this.buffer = newBuffer;
            this.bufferPosition = 0;
        }
    }

    /**
     * Seek to the given position in the stream.
     *
     * If the position is outside of internally buffered data, the buffer is
     * cleared. If the position is seeked back, the buffer is read again from
     * the underlying source.
     *
     * @param position - The position to seek to in bytes.
     */
    async seek(position: number): Promise<void> {
        const endOfBufferPosition = this.currentPosition + (this.buffer.length - this.bufferPosition);

        if (position > endOfBufferPosition || position < this.currentPosition) {
            this.buffer = new Uint8Array(0);
            this.bufferPosition = 0;

            await super.seek(position);

            if (this.reader) {
                try {
                    this.reader.releaseLock();
                } catch (error) {
                    // Streams API spec-compliant behavior: releaseLock() only throws TypeError when
                    // there are pending read requests. This can occur due to timing differences between
                    // when read() promises resolve on the client side vs when the browser's internal
                    // stream mechanism fully completes.
                    //
                    // This manifests more frequently in Firefox than Chrome due to implementation
                    // timing differences, but both are following the spec correctly.
                    //
                    // References:
                    // - https://github.com/whatwg/streams/issues/1000
                    // - https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader/releaseLock
                    //
                    // Safe to ignore since we're acquiring a new reader immediately after.
                    if (!(error instanceof TypeError)) {
                        throw error;
                    }
                }
            }
            this.reader = super.getReader();
            this.streamClosed = false;
        } else {
            // Position is within buffer range, just update buffer position.
            this.bufferPosition += position - this.currentPosition;
        }

        this.currentPosition = position;
    }
}
