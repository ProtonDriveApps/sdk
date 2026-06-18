import { AbortError } from '../../errors';
import { readStreamToUint8Array } from './streamReader';

describe('readStreamToUint8Array', () => {
    it('should return empty Uint8Array for empty stream', async () => {
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.close();
            },
        });

        const result = await readStreamToUint8Array(stream);

        expect(result).toEqual(new Uint8Array([]));
        expect(result.length).toBe(0);
    });

    it('should read single chunk into Uint8Array', async () => {
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.close();
            },
        });

        const result = await readStreamToUint8Array(stream);

        expect(result).toEqual(new Uint8Array([1, 2, 3]));
        expect(result.length).toBe(3);
    });

    it('should concatenate multiple chunks into single Uint8Array', async () => {
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.enqueue(new Uint8Array([4, 5, 6]));
                controller.enqueue(new Uint8Array([7, 8, 9]));
                controller.close();
            },
        });

        const result = await readStreamToUint8Array(stream);

        expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
        expect(result.length).toBe(9);
    });

    it('should work without abort signal', async () => {
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(new Uint8Array([42]));
                controller.close();
            },
        });

        const result = await readStreamToUint8Array(stream);

        expect(result).toEqual(new Uint8Array([42]));
    });

    it('should throw AbortError when signal is aborted during read', async () => {
        const controller = new AbortController();
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(streamController) {
                streamController.enqueue(new Uint8Array([1, 2, 3]));
                setTimeout(() => {
                    streamController.enqueue(new Uint8Array([4, 5, 6]));
                    streamController.close();
                }, 50);
            },
        });

        setTimeout(() => controller.abort(), 10);

        await expect(readStreamToUint8Array(stream, controller.signal)).rejects.toThrow(AbortError);
    });

    it('should throw AbortError when signal is already aborted before read', async () => {
        const controller = new AbortController();
        controller.abort();

        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(streamController) {
                streamController.enqueue(new Uint8Array([1, 2, 3]));
                streamController.close();
            },
        });

        await expect(readStreamToUint8Array(stream, controller.signal)).rejects.toThrow(AbortError);
    });

    it('should release reader lock so stream can be consumed once', async () => {
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(new Uint8Array([1]));
                controller.close();
            },
        });

        const result = await readStreamToUint8Array(stream);

        expect(result).toEqual(new Uint8Array([1]));

        const reader = stream.getReader();
        const { done } = await reader.read();
        expect(done).toBe(true);
        reader.releaseLock();
    });
});
