import { EntityResult } from "../../cache";
import { ProtonDriveEntitiesCache, Logger } from "../../interface";
import { DecryptedNode } from "./interface";

export enum CACHE_TAG_KEYS {
    ParentUid = 'parentUid',
    Trashed = 'trashed',
}

type DecryptedNodeResult = (
    {uid: string, ok: true, node: DecryptedNode} |
    {uid: string, ok: false, error: string}
);

/**
 * Provides caching for nodes metadata.
 * 
 * The cache is responsible for serialising and deserialising node metadata,
 * recording parent-child relationships, and recursively removing nodes.
 * 
 * The cache of node metadata should not contain any crypto material.
 */
export class NodesCache {
    constructor(private driveCache: ProtonDriveEntitiesCache, private logger?: Logger) {
        this.driveCache = driveCache;
        this.logger = logger;
    }

    async setNode(node: DecryptedNode): Promise<void> {
        const key = getCacheUid(node.uid);
        const nodeData = serialiseNode(node);
        
        const tags: { [ key: string ]: string } = {};
        if (node.parentUid) {
            tags[CACHE_TAG_KEYS.ParentUid] = node.parentUid;
        }
        if (node.trashedDate) {
            tags[CACHE_TAG_KEYS.Trashed] = 'true';
        }

        await this.driveCache.setEntity(key, nodeData, tags);
    }

    async getNode(nodeUid: string): Promise<DecryptedNode> {
        const key = getCacheUid(nodeUid);
        const nodeData = await this.driveCache.getEntity(key);
        try {
            return deserialiseNode(nodeData);
        } catch (error: unknown) {
            this.removeCorruptedNode({ nodeUid }, error);
            throw new Error(`Failed to deserialise node: ${error instanceof Error ? error.message : error}`)
        }
    }

    /**
     * Remove corrupted node never throws, but it logs so we can know
     * about issues and fix them. It is crucial to remove corrupted
     * nodes and rather let SDK re-fetch them than to auotmatically
     * fix issues and do not bother user with it.
     */
    private async removeCorruptedNode({ nodeUid, cacheUid }: { nodeUid?: string, cacheUid?: string }, corruptionError: unknown): Promise<void> {
        this.logger?.error(`Removing corrupted nodes from the cache: ${corruptionError instanceof Error ? corruptionError.message : corruptionError}`);
        try {
            if (nodeUid) {
                await this.removeNodes([nodeUid]);
            } else if (cacheUid) {
                await this.driveCache.removeEntities([cacheUid]);
            }
        } catch (removingError: unknown) {
            // The node will not be returned, thus SDK will re-fetch
            // and re-cache it. Setting it again should then fix the
            // problem.
            this.logger?.warn(`Failed to remove corrupted node from the cache: ${removingError instanceof Error ? removingError.message : removingError}`);
        }
    }

    async removeNodes(nodeUids: string[]): Promise<void> {
        const cacheUids = nodeUids.map(getCacheUid);
        await this.driveCache.removeEntities(cacheUids);
        for (const nodeUid of nodeUids) {
            try {
                const childrenCacheUids = await this.getRecursiveChildrenCacheUids(nodeUid);
                // Reverse the order to remove children first.
                // Crucial to not leave any children without parent
                // if removing nodes fails.
                childrenCacheUids.reverse();
                await this.driveCache.removeEntities(childrenCacheUids);
            } catch (error: unknown) {
                // TODO: Should we throw here to the client?
                this.logger?.error(`Failed to remove children from the cache: ${error instanceof Error ? error.message : error}`);
            }
        }
    }

    private async getRecursiveChildrenCacheUids(parentNodeUid: string): Promise<string[]> {
        const cacheUids = [];
        for await (const result of this.driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.ParentUid, parentNodeUid)) {
            cacheUids.push(result.uid);
            const childrenCacheUids = await this.getRecursiveChildrenCacheUids(getNodeUid(result.uid));
            cacheUids.push(...childrenCacheUids);
        }
        return cacheUids;
    }

    async *iterateNodes(nodeUids: string[]): AsyncGenerator<DecryptedNodeResult> {
        const cacheUids = nodeUids.map(getCacheUid);
        for await (const result of this.driveCache.iterateEntities(cacheUids)) {
            const node = await this.convertCacheResult(result);
            if (node) {
                yield node;
            }
        }
    }

    async *iterateChildren(parentNodeUid: string): AsyncGenerator<DecryptedNodeResult> {
        for await (const result of this.driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.ParentUid, parentNodeUid)) {
            const node = await this.convertCacheResult(result);
            if (node) {
                yield node;
            }
        }
    }

    async *iterateTrashedNodes(): AsyncGenerator<DecryptedNodeResult> {
        for await (const result of this.driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.Trashed, 'true')) {
            const node = await this.convertCacheResult(result);
            if (node) {
                yield node;
            }
        }
    }

    /**
     * Converts result from the cache with cache UID and data to result of node
     * with node UID and DecryptedNode.
     */
    private async convertCacheResult(result: EntityResult<string>): Promise<DecryptedNodeResult | null> {
        let nodeUid;
        try {
            nodeUid = getNodeUid(result.uid);
        } catch (error: unknown) {
            await this.removeCorruptedNode({ cacheUid: result.uid }, error)
            return null;
        }
        if (result.ok) {
            let node;
            try {
                node = deserialiseNode(result.data)
            } catch (error: unknown) {
                await this.removeCorruptedNode({ nodeUid }, error);
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
