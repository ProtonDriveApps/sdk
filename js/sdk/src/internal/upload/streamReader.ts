import { AbortError } from "../../errors";

/**
 * Reads a ReadableStream into a Uint8Array.
 */
export async function readStreamToUint8Array(
    stream: ReadableStream<Uint8Array<ArrayBuffer>>,
    signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (signal?.aborted) {
                throw new AbortError();
            }
            const chunk = value;
            totalLength += chunk.length;
            chunks.push(chunk);
        }

        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    } finally {
        reader.releaseLock();
    }
}
