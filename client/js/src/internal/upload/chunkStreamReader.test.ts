import { ChunkStreamReader } from './chunkStreamReader';

describe('ChunkStreamReader', () => {
    let stream: ReadableStream<Uint8Array<ArrayBuffer>>;
    let cancel: jest.Mock;

    beforeEach(() => {
        cancel = jest.fn();
        stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.enqueue(new Uint8Array([4, 5, 6]));
                controller.enqueue(new Uint8Array([7, 8, 9]));
                controller.enqueue(new Uint8Array([10, 11, 12]));
                controller.close();
            },
            cancel,
        });
    });

    it('should not cancel the stream when fully read', async () => {
        const reader = new ChunkStreamReader(stream, 3);

        for await (const _chunk of reader.iterateChunks()) {
            // consume all chunks
        }

        expect(cancel).not.toHaveBeenCalled();
    });

    it('should cancel the stream when consumer stops early', async () => {
        const openStream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            pull(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
            },
            cancel,
        });
        const reader = new ChunkStreamReader(openStream, 3);

        for await (const _chunk of reader.iterateChunks()) {
            break;
        }

        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('should cancel the stream and end iteration when aborted during pending read', async () => {
        const abortController = new AbortController();
        const pendingStream = new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel });
        const reader = new ChunkStreamReader(pendingStream, 3, abortController.signal);

        const chunks: Uint8Array<ArrayBuffer>[] = [];
        const consume = async () => {
            for await (const chunk of reader.iterateChunks()) {
                chunks.push(chunk);
            }
        };
        const promise = consume();
        abortController.abort();
        await promise;

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(chunks).toEqual([]);
    });

    it('should cancel the stream when already aborted', async () => {
        const abortController = new AbortController();
        abortController.abort();
        const pendingStream = new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel });
        const reader = new ChunkStreamReader(pendingStream, 3, abortController.signal);

        for await (const _chunk of reader.iterateChunks()) {
            // no chunks expected
        }

        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('should cancel the stream when consumer throws', async () => {
        const openStream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            pull(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
            },
            cancel,
        });
        const reader = new ChunkStreamReader(openStream, 3);

        const consume = async () => {
            for await (const _chunk of reader.iterateChunks()) {
                throw new Error('consumer failed');
            }
        };

        await expect(consume()).rejects.toThrow('consumer failed');
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('should yield chunks as enqueued if matching the size', async () => {
        const reader = new ChunkStreamReader(stream, 3);

        const chunks: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of reader.iterateChunks()) {
            chunks.push(new Uint8Array(chunk));
        }

        expect(chunks.length).toBe(4);
        expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
        expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));
        expect(chunks[2]).toEqual(new Uint8Array([7, 8, 9]));
        expect(chunks[3]).toEqual(new Uint8Array([10, 11, 12]));
    });

    it('should yield smaller chunks than enqueued chunks', async () => {
        const reader = new ChunkStreamReader(stream, 2);

        const chunks: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of reader.iterateChunks()) {
            chunks.push(new Uint8Array(chunk));
        }

        expect(chunks.length).toBe(6);
        expect(chunks[0]).toEqual(new Uint8Array([1, 2]));
        expect(chunks[1]).toEqual(new Uint8Array([3, 4]));
        expect(chunks[2]).toEqual(new Uint8Array([5, 6]));
        expect(chunks[3]).toEqual(new Uint8Array([7, 8]));
        expect(chunks[4]).toEqual(new Uint8Array([9, 10]));
        expect(chunks[5]).toEqual(new Uint8Array([11, 12]));
    });

    it('should yield bigger chunks than enqueued chunks', async () => {
        const reader = new ChunkStreamReader(stream, 4);

        const chunks: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of reader.iterateChunks()) {
            chunks.push(new Uint8Array(chunk));
        }

        expect(chunks.length).toBe(3);
        expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3, 4]));
        expect(chunks[1]).toEqual(new Uint8Array([5, 6, 7, 8]));
        expect(chunks[2]).toEqual(new Uint8Array([9, 10, 11, 12]));
    });

    it('should yield last incomplete chunk', async () => {
        const reader = new ChunkStreamReader(stream, 5);

        const chunks: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of reader.iterateChunks()) {
            chunks.push(new Uint8Array(chunk));
        }

        expect(chunks.length).toBe(3);
        expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
        expect(chunks[1]).toEqual(new Uint8Array([6, 7, 8, 9, 10]));
        expect(chunks[2]).toEqual(new Uint8Array([11, 12]));
    });

    it('should yield as one big chunk', async () => {
        const reader = new ChunkStreamReader(stream, 100);

        const chunks: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of reader.iterateChunks()) {
            chunks.push(new Uint8Array(chunk));
        }

        expect(chunks.length).toBe(1);
        expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    });
});
