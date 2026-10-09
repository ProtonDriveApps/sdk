import { wireOk } from '@boltffi/runtime';

import type { DriveSdkClient, Node, NodeUid, StreamToken } from '../vendor/proton_drive_sdk_search.js';

export type NodeSource = (nodeUids: NodeUid[]) => AsyncIterable<Node>;

const BATCH_SIZE = 50;

/**
 * Feeds nodes into the drive search module. Each opened stream keeps its
 * iterator here, keyed by the token handed to the module.
 *
 * Nodes that `iterateNodes` doesn't yield (e.g. missing ones) are skipped; the module
 * treats them as unindexed. Thrown errors reach the module as `IterationFailed`.
 *
 * Object results are wrapped in `wireOk`: boltffi can't tell a bare object (or
 * array) from a `WireResult` and rejects it as ambiguous.
 */
export class SearchDriveSdkClient implements DriveSdkClient {
    private streams = new Map<bigint, AsyncIterator<Node>>();

    private nextId = 0n;

    constructor(private iterateNodes: NodeSource) {
        this.iterateNodes = iterateNodes;
    }

    async openNodeStream(nodeUids: NodeUid[]) {
        const id = this.nextId++;
        this.streams.set(id, this.iterateNodes(nodeUids)[Symbol.asyncIterator]());
        return wireOk({ id });
    }

    async nextNode({ id }: StreamToken) {
        return wireOk(await this.next(id));
    }

    async nextNodeBatch({ id }: StreamToken) {
        const batch: Node[] = [];
        while (batch.length < BATCH_SIZE) {
            const node = await this.next(id);
            if (!node) {
                break;
            }
            batch.push(node);
        }
        return wireOk(batch.length ? batch : null);
    }

    closeNodeStream({ id }: StreamToken): void {
        void this.streams.get(id)?.return?.();
        this.streams.delete(id);
    }

    private async next(id: bigint): Promise<Node | null> {
        const result = await this.getStream(id).next();
        return result.done ? null : result.value;
    }

    private getStream(id: bigint): AsyncIterator<Node> {
        const stream = this.streams.get(id);
        if (!stream) {
            throw new Error(`Unknown node stream ${id}`);
        }
        return stream;
    }
}
