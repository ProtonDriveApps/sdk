import { ProtonDriveCache, EntityResult } from "../../cache";
import { Logger } from "../../interface";
import { DecryptedNode } from "./interface.js";

export enum CACHE_TAG_KEYS {
    ParentUid = 'parentUid',
    Trashed = 'trashed',
}

/**
 * Provides caching for nodes metadata.
 * 
 * The cache is responsible for serialising and deserialising node metadata,
 * recording parent-child relationships, and recursively removing nodes.
 * 
 * The cache of node metadata should not contain any crypto material.
 */
export function nodesCache(driveCache: ProtonDriveCache, logger?: Logger) {
    async function setNode(node: DecryptedNode) {
        const key = getCacheUid(node.uid);
        const nodeData = serialiseNode(node);
        
        const tags: { [ key: string ]: string } = {};
        if (node.parentUid) {
            tags[CACHE_TAG_KEYS.ParentUid] = node.parentUid;
        }
        if (node.trashedDate) {
            tags[CACHE_TAG_KEYS.Trashed] = 'true';
        }

        await driveCache.setEntity(key, nodeData, tags);
    }

    async function getNode(nodeUid: string): Promise<DecryptedNode> {
        const key = getCacheUid(nodeUid);
        const nodeData = await driveCache.getEntity(key);
        try {
            return deserialiseNode(nodeData);
        } catch (error: unknown) {
            removeCorruptedNode({ nodeUid }, error);
            throw new Error(`Failed to deserialise node: ${error instanceof Error ? error.message : error}`)
        }
    }

    /**
     * Remove corrupted node never throws, but it logs so we can know
     * about issues and fix them. It is crucial to remove corrupted
     * nodes and rather let SDK re-fetch them than to auotmatically
     * fix issues and do not bother user with it.
     */
    async function removeCorruptedNode({ nodeUid, cacheUid }: { nodeUid?: string, cacheUid?: string }, corruptionError: unknown) {
        logger?.error(`Removing corrupted nodes from the cache: ${corruptionError instanceof Error ? corruptionError.message : corruptionError}`);
        try {
            if (nodeUid) {
                await removeNodes([nodeUid]);
            } else if (cacheUid) {
                await driveCache.removeEntities([cacheUid]);
            }
        } catch (removingError: unknown) {
            // The node will not be returned, thus SDK will re-fetch
            // and re-cache it. Setting it again should then fix the
            // problem.
            logger?.warn(`Failed to remove corrupted node from the cache: ${removingError instanceof Error ? removingError.message : removingError}`);
        }
    }

    async function removeNodes(nodeUids: string[]) {
        const cacheUids = nodeUids.map(getCacheUid);
        await driveCache.removeEntities(cacheUids);
        for (const nodeUid of nodeUids) {
            try {
                const childrenCacheUids = await getRecursiveChildrenCacheUids(nodeUid);
                // Reverse the order to remove children first.
                // Crucial to not leave any children without parent
                // if removing nodes fails.
                childrenCacheUids.reverse();
                await driveCache.removeEntities(childrenCacheUids);
            } catch (error: unknown) {
                // TODO: Should we throw here to the client?
                logger?.error(`Failed to remove children from the cache: ${error instanceof Error ? error.message : error}`);
            }
        }
    }

    async function getRecursiveChildrenCacheUids(parentNodeUid: string): Promise<string[]> {
        const cacheUids = [];
        for await (const result of driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.ParentUid, parentNodeUid)) {
            cacheUids.push(result.uid);
            const childrenCacheUids = await getRecursiveChildrenCacheUids(getNodeUid(result.uid));
            cacheUids.push(...childrenCacheUids);
        }
        return cacheUids;
    }

    async function *iterateNodes(nodeUids: string[]) {
        const cacheUids = nodeUids.map(getCacheUid);
        for await (const result of driveCache.iterateEntities(cacheUids)) {
            const node = await convertCacheResult(result);
            if (node) {
                yield node;
            }
        }
    }

    async function *iterateChildren(parentNodeUid: string) {
        for await (const result of driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.ParentUid, parentNodeUid)) {
            const node = await convertCacheResult(result);
            if (node) {
                yield node;
            }
        }
    }

    async function *iterateTrashedNodes() {
        for await (const result of driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.Trashed, 'true')) {
            const node = await convertCacheResult(result);
            if (node) {
                yield node;
            }
        }
    }

    /**
     * Converts result from the cache with cache UID and data to result of node
     * with node UID and DecryptedNode.
     */
    async function convertCacheResult(result: EntityResult): Promise<(
        {uid: string, ok: true, node: DecryptedNode} | 
        {uid: string, ok: false, error: string} | 
        null
    )> {
        let nodeUid;
        try {
            nodeUid = getNodeUid(result.uid);
        } catch (error: unknown) {
            await removeCorruptedNode({ cacheUid: result.uid }, error)
            return null;
        }
        if (result.ok) {
            let node;
            try {
                node = deserialiseNode(result.data)
            } catch (error: unknown) {
                await removeCorruptedNode({ nodeUid }, error);
                return null;
            }
            return {
                uid: nodeUid,
                ok: true,
                node,
            }
        } else {
            return {
                ...result,
                uid: nodeUid,
            };
        }
    }

    function getCacheUid(nodeUid: string) {
        return `node-${nodeUid}`;
    }

    function getNodeUid(cacheUid: string) {
        if (!cacheUid.startsWith('node-')) {
            throw new Error('Unexpected cached node uid');
        }
        return cacheUid.substring(5);
    }

    function serialiseNode(node: DecryptedNode) {
        return JSON.stringify(node);
    }

    function deserialiseNode(nodeData: string): DecryptedNode {
        const node = JSON.parse(nodeData);
        if (
           !node || typeof node !== 'object' ||
           !node.uid || typeof node.uid !== 'string' ||
           typeof node.parentUid !== 'string' ||
           !node.directMemberRole || typeof node.directMemberRole !== 'string' ||
           !node.type || typeof node.type !== 'string' ||
           !node.mimeType || typeof node.mimeType !== 'string' ||
           typeof node.isShared !== 'boolean' ||
           !node.createdDate || typeof node.createdDate !== 'string' ||
           (typeof node.trashedDate !== 'string' && node.trashedDate !== null) ||
           !node.volumeId || typeof node.volumeId !== 'string'
       ) {
           throw new Error(`Invalid node data: ${nodeData}`);
       }
       return {
           ...node,
           createdDate: new Date(node.createdDate),
           trashedDate: node.trashedDate ? new Date(node.trashedDate) : null,
       };
    }

    return {
        setNode,
        getNode,
        removeNodes,
        iterateNodes,
        iterateChildren,
        iterateTrashedNodes,
    }
}
