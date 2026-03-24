import { sha1 } from '@noble/hashes/legacy';
import { bytesToHex } from '@noble/hashes/utils';

type UploadDigestsOptions = {
    useWorkerHashing?: boolean;
};

type NodeWorkerRequest =
    | { id: number; type: 'update'; payload: Uint8Array<ArrayBuffer> }
    | { id: number; type: 'digest' }
    | { id: number; type: 'dispose' };

type NodeWorkerResponse = { id: number; ok: true; hex?: string } | { id: number; ok: false; error: string };

class NodeSha1Worker {
    private worker: {
        postMessage: (message: NodeWorkerRequest) => void;
        on: (event: 'message', listener: (message: NodeWorkerResponse) => void) => void;
        once: (event: 'exit', listener: () => void) => void;
        terminate: () => Promise<number>;
    };

    private requestId = 0;
    private pending = new Map<number, { resolve: (hex?: string) => void; reject: (error: Error) => void }>();

    constructor(WorkerCtor: new (...args: any[]) => any) {
        const workerCode = `
            const { parentPort } = require('node:worker_threads');
            const { createHash } = require('node:crypto');
            const hash = createHash('sha1');

            parentPort.on('message', (message) => {
                try {
                    if (message.type === 'update') {
                        hash.update(Buffer.from(message.payload));
                        parentPort.postMessage({ id: message.id, ok: true });
                        return;
                    }

                    if (message.type === 'digest') {
                        parentPort.postMessage({ id: message.id, ok: true, hex: hash.digest('hex') });
                        return;
                    }

                    if (message.type === 'dispose') {
                        parentPort.postMessage({ id: message.id, ok: true });
                    }
                } catch (error) {
                    parentPort.postMessage({
                        id: message.id,
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            });
        `;

        this.worker = new WorkerCtor(workerCode, { eval: true });

        this.worker.on('message', (message: NodeWorkerResponse) => {
            const pending = this.pending.get(message.id);
            if (!pending) {
                return;
            }

            this.pending.delete(message.id);
            if (message.ok) {
                pending.resolve(message.hex);
            } else {
                pending.reject(new Error(message.error));
            }
        });

        this.worker.once('exit', () => {
            for (const { reject } of this.pending.values()) {
                reject(new Error('Digest worker exited unexpectedly'));
            }
            this.pending.clear();
        });
    }

    private request(message: Omit<NodeWorkerRequest, 'id'>): Promise<string | undefined> {
        const id = ++this.requestId;

        return new Promise<string | undefined>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ ...message, id } as NodeWorkerRequest);
        });
    }

    async update(payload: Uint8Array<ArrayBuffer>): Promise<void> {
        await this.request({ type: 'update', payload });
    }

    async digest(): Promise<string> {
        return (await this.request({ type: 'digest' })) || '';
    }

    async dispose(): Promise<void> {
        try {
            await this.request({ type: 'dispose' });
        } finally {
            await this.worker.terminate();
        }
    }
}

export class UploadDigests {
    private worker: NodeSha1Worker | undefined;
    private queue = Promise.resolve();

    constructor(
        private digestSha1 = sha1.create(),
        options?: UploadDigestsOptions,
    ) {
        this.digestSha1 = digestSha1;

        if (options?.useWorkerHashing) {
            this.worker = this.createNodeWorker();
        }
    }

    private createNodeWorker(): NodeSha1Worker | undefined {
        try {
            const requireFn = Function('return require')() as (id: string) => any;
            const workerThreads = requireFn('node:worker_threads') as {
                Worker: new (...args: any[]) => any;
            };

            if (!workerThreads.Worker) {
                return undefined;
            }

            return new NodeSha1Worker(workerThreads.Worker);
        } catch {
            return undefined;
        }
    }

    update(data: Uint8Array): void {
        if (!this.worker) {
            this.digestSha1.update(data);
            return;
        }

        const chunkCopy = new Uint8Array(data);
        this.queue = this.queue.then(() => this.worker?.update(chunkCopy));
    }

    async digests(): Promise<{ sha1: string }> {
        await this.queue;

        if (this.worker) {
            return {
                sha1: await this.worker.digest(),
            };
        }

        return {
            sha1: bytesToHex(this.digestSha1.digest()),
        };
    }

    async dispose(): Promise<void> {
        await this.queue;
        if (!this.worker) {
            return;
        }

        await this.worker.dispose();
        this.worker = undefined;
    }
}
