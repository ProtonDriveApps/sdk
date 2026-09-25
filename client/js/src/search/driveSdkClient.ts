import { wireOk } from '@boltffi/runtime';

import type { DriveSdkClient, Node, NodeUid } from './vendor/proton_drive_sdk_search.js';

export type NodeSource = (nodeUids: NodeUid[]) => AsyncIterable<Node>;

const BATCH_SIZE = 50;

/**
 * Feeds nodes into the search engine. Each opened stream keeps its iterator here,
 * keyed by the token handed to the engine.
 *
 * Nodes that `iterateNodes` doesn't yield (e.g. missing ones) are skipped; the engine
 * treats them as unindexed. Thrown errors reach the engine as `IterationFailed`.
 *
 * Object results are wrapped in `wireOk`: boltffi can't tell a bare object (or
 * array) from a `WireResult` and rejects it as ambiguous.
 */
export function createSearchDriveSdkClient(iterateNodes: NodeSource) {
    const streams = new Map<bigint, AsyncIterator<Node>>();
    let nextId = 0n;

    const getStream = (id: bigint) => {
        const stream = streams.get(id);
        if (!stream) {
            throw new Error(`Unknown node stream ${id}`);
        }
        return stream;
    };

    const next = async (id: bigint) => {
        const result = await getStream(id).next();
        return result.done ? null : result.value;
    };

    return {
        openNodeStream: async (nodeUids) => {
            const id = nextId++;
            streams.set(id, iterateNodes(nodeUids)[Symbol.asyncIterator]());
            return wireOk({ id });
        },
        nextNode: async ({ id }) => wireOk(await next(id)),
        nextNodeBatch: async ({ id }) => {
            const batch: Node[] = [];
            while (batch.length < BATCH_SIZE) {
                const node = await next(id);
                if (!node) {
                    break;
                }
                batch.push(node);
            }
            return wireOk(batch.length ? batch : null);
        },
        closeNodeStream: ({ id }) => {
            void streams.get(id)?.return?.();
            streams.delete(id);
        },
    } satisfies DriveSdkClient;
}
