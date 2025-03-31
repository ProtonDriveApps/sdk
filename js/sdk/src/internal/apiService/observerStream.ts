export class ObserverStream extends TransformStream<Uint8Array, Uint8Array> {
    constructor(fn?: (chunk: Uint8Array) => void) {
        super({
            transform(chunk, controller) {
                fn?.(chunk);
                controller.enqueue(chunk);
            },
        });
    }
}
