import { wireOk } from '@boltffi/runtime';

import { createSearchDriveSdkClient, type NodeSource } from './driveSdkClient';
import type { Node, NodeUid } from './vendor/proton_drive_sdk_search.js';

const node = (uid: string) => ({ uid: { inner: uid } }) as Node;

const sourceOf = (nodes: Node[]): NodeSource =>
    async function* (nodeUids: NodeUid[]) {
        const wanted = new Set(nodeUids.map((uid) => uid.inner));
        yield* nodes.filter((n) => wanted.has(n.uid.inner));
    };

describe('createSearchDriveSdkClient', () => {
    it('streams the requested nodes one by one, then null', async () => {
        const client = createSearchDriveSdkClient(sourceOf([node('a'), node('b'), node('c')]));

        const { value: token } = await client.openNodeStream([{ inner: 'a' }, { inner: 'c' }]);

        expect(await client.nextNode(token)).toEqual(wireOk(node('a')));
        expect(await client.nextNode(token)).toEqual(wireOk(node('c')));
        expect(await client.nextNode(token)).toEqual(wireOk(null));
    });

    it('streams nodes in batches, then null', async () => {
        const client = createSearchDriveSdkClient(sourceOf([node('a'), node('b')]));

        const { value: token } = await client.openNodeStream([{ inner: 'a' }, { inner: 'b' }]);

        expect(await client.nextNodeBatch(token)).toEqual(wireOk([node('a'), node('b')]));
        expect(await client.nextNodeBatch(token)).toEqual(wireOk(null));
    });

    it('keeps concurrent streams independent', async () => {
        const client = createSearchDriveSdkClient(sourceOf([node('a'), node('b')]));

        const { value: first } = await client.openNodeStream([{ inner: 'a' }]);
        const { value: second } = await client.openNodeStream([{ inner: 'b' }]);

        expect(await client.nextNode(second)).toEqual(wireOk(node('b')));
        expect(await client.nextNode(first)).toEqual(wireOk(node('a')));
    });

    it('rejects reads from a closed stream and stops the source', async () => {
        let finished = false;
        const client = createSearchDriveSdkClient(async function* () {
            try {
                yield node('a');
                yield node('b');
            } finally {
                finished = true;
            }
        });

        const { value: token } = await client.openNodeStream([]);
        await client.nextNode(token);
        client.closeNodeStream(token);

        await expect(client.nextNode(token)).rejects.toThrow('Unknown node stream');
        await new Promise((resolve) => setTimeout(resolve));
        expect(finished).toBe(true);
    });
});
