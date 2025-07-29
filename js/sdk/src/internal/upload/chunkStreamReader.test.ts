import { ChunkStreamReader } from './chunkStreamReader';

describe('ChunkStreamReader', () => {
    let stream: ReadableStream<Uint8Array>;

    beforeEach(() => {
        stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.enqueue(new Uint8Array([4, 5, 6]));
                controller.enqueue(new Uint8Array([7, 8, 9]));
                controller.enqueue(new Uint8Array([10, 11, 12]));
                controller.close();
            },
        });
    });

    it('should yield chunks as enqueued if matching the size', async () => {
        const reader = new ChunkStreamReader(stream, 3);

        const chunks: Uint8Array[] = [];
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

        const chunks: Uint8Array[] = [];
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

        const chunks: Uint8Array[] = [];
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

        const chunks: Uint8Array[] = [];
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

        const chunks: Uint8Array[] = [];
        for await (const chunk of reader.iterateChunks()) {
            chunks.push(new Uint8Array(chunk));
        }

        expect(chunks.length).toBe(1);
        expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    });
});
