import { MemoryCache } from "../../cache";
import { NodeType, MemberRole } from "../../interface";
import { CACHE_TAG_KEYS, NodesCache } from "./cache";
import { DecryptedNode } from "./interface";

function generateNode(uid: string, parentUid='root', params: Partial<DecryptedNode> & { volumeId?: string } = {}): DecryptedNode {
    return {
        uid: `${params.volumeId || "volumeId"}~:${uid}`,
        parentUid: `${params.volumeId || "volumeId"}~:${parentUid}`,
        directMemberRole: MemberRole.Admin,
        type: NodeType.File,
        mimeType: "text",
        isShared: false,
        createdDate: new Date(),
        trashedDate: undefined,
        volumeId: "volumeId",
        isStale: false,
        ...params,
    } as DecryptedNode;
}

async function generateTreeStructure(cache: NodesCache) {
    for (const node of [
        generateNode('node1', 'root'),
        generateNode('node1a', 'node1'),
        generateNode('node1b', 'node1', { trashedDate: new Date() }),
        generateNode('node1c', 'node1'),
        generateNode('node1c-alpha', 'node1c'),
        generateNode('node1c-beta', 'node1c', { trashedDate: new Date() }),

        generateNode('node2', 'root'),
        generateNode('node2a', 'node2'),
        generateNode('node2b', 'node2', { trashedDate: new Date() }),

        generateNode('node3', 'root'),

        generateNode('root-otherVolume', '', { volumeId: 'volume2' }),
    ]) {
        await cache.setNode(node);
    }
}

async function verifyNodesCache(cache: NodesCache, expectedNodes: string[], expectedMissingNodes: string[]) {
    for (const nodeUid of expectedNodes) {
        try {
            await cache.getNode(`volumeId~:${nodeUid}`);
        } catch (error) {
            throw new Error(`${nodeUid} should be in the cache: ${error}`);
        }
    }

    for (const nodeUid of expectedMissingNodes) {
        try {
            await cache.getNode(`volumeId~:${nodeUid}`);
            throw new Error(`${nodeUid} should not be in the cache`);
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    }
}

describe('nodesCache', () => {
    let memoryCache: MemoryCache<string>;
    let cache: NodesCache;

    beforeEach(() => {
        memoryCache = new MemoryCache();
        memoryCache.setEntity('node-volumeId~:root', JSON.stringify(generateNode('root', '')));
        memoryCache.setEntity('node-badObject', 'aaa', [`${CACHE_TAG_KEYS.ParentUid}:root`]);

        cache = new NodesCache(memoryCache);
    });

    it('should store and retrieve node', async () => {
        const node = generateNode('node1', '');

        await cache.setNode(node);
        const result = await cache.getNode(node.uid);

        expect(result).toStrictEqual(node);
    });

    it('should throw an error when retrieving a non-existing entity', async () => {
        try {
            await cache.getNode('nonExistingNodeUid');
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should throw an error when retrieving a corrupted node and remove the node from the cache', async () => {
        try {
            await cache.getNode('badObject');
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Failed to deserialise node: Unexpected token \'a\', \"aaa\" is not valid JSON');
        }

        try {
            await memoryCache.getEntity('nodes-badObject');
            fail('Should have thrown an error');
        } catch (error) {
            expect(`${error}`).toBe('Error: Entity not found');
        }
    });

    it('should remove node without children', async () => {
        await generateTreeStructure(cache);
        await cache.removeNodes(['volumeId~:node3']);
        await verifyNodesCache(
            cache,
            ['node1', 'node1a', 'node1b', 'node1c', 'node1c-alpha', 'node1c-beta', 'node2', 'node2a', 'node2b'],
            ['node3'],
        )
    });

    it('should remove node and its children', async () => {
        await generateTreeStructure(cache);
        await cache.removeNodes(['volumeId~:node2']);
        await verifyNodesCache(
            cache,
            ['node1', 'node1a', 'node1b', 'node1c', 'node1c-alpha', 'node1c-beta', 'node3'],
            ['node2', 'node2a', 'node2b',],
        )
    });

    it('should remove node and its children recursively', async () => {
        await generateTreeStructure(cache);
        await cache.removeNodes(['volumeId~:node1']);
        await verifyNodesCache(
            cache,
            ['node2', 'node2a', 'node2b', 'node3'],
            ['node1', 'node1a', 'node1b', 'node1c', 'node1c-alpha', 'node1c-beta'],
        );
    });

    it('should iterate requested nodes', async () => {
        await generateTreeStructure(cache);
        const result = await Array.fromAsync(cache.iterateNodes(['volumeId~:node1', 'volumeId~:node2']));
        const nodeUids = result.map(({ uid }) => uid);
        expect(nodeUids).toStrictEqual(['volumeId~:node1', 'volumeId~:node2']);
    });

    it('should iterate children without trashed items', async () => {
        await generateTreeStructure(cache);
        const result = await Array.fromAsync(cache.iterateChildren('volumeId~:node1'));
        const nodeUids = result.map(({ uid }) => uid);
        expect(nodeUids).toStrictEqual(['volumeId~:node1a', 'volumeId~:node1c']);
    });

    it('should iterate children and silently remove a corrupted node', async () => {
        await generateTreeStructure(cache);
        // badObject has root as parent.
        const result = await Array.fromAsync(cache.iterateChildren('volumeId~:root'));
        const nodeUids = result.map(({ uid }) => uid);
        expect(nodeUids).toStrictEqual(['volumeId~:node1', 'volumeId~:node2', 'volumeId~:node3']);
        await verifyNodesCache(
            cache,
            ['root', 'node1', 'node1a', 'node1b', 'node1c', 'node1c-alpha', 'node1c-beta', 'node2', 'node2a', 'node2b', 'node3'],
            ['badObject'],
        )
    });

    it('should iterate trashed nodes', async () => {
        await generateTreeStructure(cache);
        const result = await Array.fromAsync(cache.iterateTrashedNodes());
        const nodeUids = result.map(({ uid }) => uid);
        expect(nodeUids).toStrictEqual(['volumeId~:node1b', 'volumeId~:node1c-beta', 'volumeId~:node2b']);
    });

    it('should set and unset children loaded state', async () => {
        expect(await cache.isFolderChildrenLoaded('volumeId~:node1')).toBe(false);

        await cache.setFolderChildrenLoaded('volumeId~:node1');
        expect(await cache.isFolderChildrenLoaded('volumeId~:node1')).toBe(true);

        await cache.resetFolderChildrenLoaded('volumeId~:node1');
        expect(await cache.isFolderChildrenLoaded('volumeId~:node1')).toBe(false);
    });

    it('should set nodes from the volume as stale', async () => {
        await generateTreeStructure(cache);
        await cache.setNodesStaleFromVolume('volumeId');

        const staleNodeUids = ['node1', 'node1a', 'node1b', 'node1c', 'node1c-alpha', 'node1c-beta', 'node2', 'node2a', 'node2b', 'node3']
            .map((uid) => `volumeId~:${uid}`);
        const result = await Array.fromAsync(cache.iterateNodes([...staleNodeUids, 'volume2~:root-otherVolume']));
        const got = result.map((item) => ({ uid: item.uid, isStale: item.ok ? item.node.isStale : item.error }));
        const expected = [
            ...staleNodeUids.map((uid) => ({ uid, isStale: true })),
            { uid: 'volume2~:root-otherVolume', isStale: false },
        ];
        expect(got).toEqual(expected);
    });
});
