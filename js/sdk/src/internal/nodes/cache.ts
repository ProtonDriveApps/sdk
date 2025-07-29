import { EntityResult } from "../../cache";
import { ProtonDriveEntitiesCache, Logger, resultOk, Result } from "../../interface";
import { splitNodeUid } from "../uids";
import { DecryptedNode, DecryptedRevision } from "./interface";

export enum CACHE_TAG_KEYS {
    ParentUid = 'nodeParentUid',
    Trashed = 'nodeTrashed',
    Roots = 'nodeRoot',
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
    constructor(private logger: Logger, private driveCache: ProtonDriveEntitiesCache) {
        this.logger = logger;
        this.driveCache = driveCache;
    }

    async setNode(node: DecryptedNode): Promise<void> {
        const key = getCacheUid(node.uid);
        const nodeData = serialiseNode(node);
        const { volumeId } = splitNodeUid(node.uid);

        const tags = [`volume:${volumeId}`];
        if (node.parentUid) {
            tags.push(`${CACHE_TAG_KEYS.ParentUid}:${node.parentUid}`)
        } else {
            tags.push(`${CACHE_TAG_KEYS.Roots}:${volumeId}`)
        }
        if (node.trashTime) {
            tags.push(`${CACHE_TAG_KEYS.Trashed}`)
        }

        await this.driveCache.setEntity(key, nodeData, tags);
    }

    async getNode(nodeUid: string): Promise<DecryptedNode> {
        const key = getCacheUid(nodeUid);
        const nodeData = await this.driveCache.getEntity(key);
        try {
            return deserialiseNode(nodeData);
        } catch (error: unknown) {
            await this.removeCorruptedNode({ nodeUid }, error);
            throw new Error(`Failed to deserialise node: ${error instanceof Error ? error.message : error}`)
        }
    }

    /**
     * Set all nodes on given node as stale. This is useful when we
     * get refresh event from the server and we thus don't know
     * which nodes were up-to-date anymore.
     */
    async setNodesStaleFromVolume(volumeId: string): Promise<void> {
        for await (const result of this.driveCache.iterateEntitiesByTag(`volume:${volumeId}`)) {
            const node = await this.convertCacheResult(result);
            if (node && node.ok) {
                node.node.isStale = true;
                await this.setNode(node.node);
            }
        }

        // Force all calls to children UIDs to be re-fetched.
        for await (const result of this.driveCache.iterateEntitiesByTag(`children-volume:${volumeId}`)) {
            await this.driveCache.removeEntities([result.key]);
        }
    }

    /**
     * Remove all entries associated with a volume.
     *
     * This is needed when a user looses access to a volume.
     */
    async removeVolume(volumeId: string): Promise<void> {
        for await (const result of this.iterateRootNodeUids(volumeId)) {
            await this.removeNodes([result.key]);
        }
    }

    /**
     * Remove corrupted node never throws, but it logs so we can know
     * about issues and fix them. It is crucial to remove corrupted
     * nodes and rather let SDK re-fetch them than to auotmatically
     * fix issues and do not bother user with it.
     */
    private async removeCorruptedNode({ nodeUid, cacheUid }: { nodeUid?: string, cacheUid?: string }, corruptionError: unknown): Promise<void> {
        this.logger.error(`Removing corrupted nodes from the cache`, corruptionError);
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
            this.logger.warn(`Failed to remove corrupted node from the cache: ${removingError instanceof Error ? removingError.message : removingError}`);
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
                this.logger.error(`Failed to remove children from the cache`, error);
            }
        }
    }

    private async getRecursiveChildrenCacheUids(parentNodeUid: string): Promise<string[]> {
        const cacheUids = [];
        for await (const result of this.driveCache.iterateEntitiesByTag(`${CACHE_TAG_KEYS.ParentUid}:${parentNodeUid}`)) {
            cacheUids.push(result.key);
            const childrenCacheUids = await this.getRecursiveChildrenCacheUids(getNodeUid(result.key));
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
        for await (const result of this.driveCache.iterateEntitiesByTag(`${CACHE_TAG_KEYS.ParentUid}:${parentNodeUid}`)) {
            const node = await this.convertCacheResult(result);
            if (node && (!node.ok || !node.node.trashTime)) {
                yield node;
            }
        }
    }

    async *iterateRootNodeUids(volumeId: string): AsyncGenerator<EntityResult<string>> {
        yield* this.driveCache.iterateEntitiesByTag(`${CACHE_TAG_KEYS.Roots}:${volumeId}`);
    }

    async *iterateTrashedNodes(): AsyncGenerator<DecryptedNodeResult> {
        for await (const result of this.driveCache.iterateEntitiesByTag(CACHE_TAG_KEYS.Trashed)) {
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
            nodeUid = getNodeUid(result.key);
        } catch (error: unknown) {
            await this.removeCorruptedNode({ cacheUid: result.key }, error)
            return null;
        }
        if (result.ok) {
            let node;
            try {
                node = deserialiseNode(result.value)
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

    async setFolderChildrenLoaded(nodeUid: string): Promise<void> {
        const { volumeId } = splitNodeUid(nodeUid);
        await this.driveCache.setEntity(`node-children-${nodeUid}`, 'loaded', [`children-volume:${volumeId}`]);
    }

    async resetFolderChildrenLoaded(nodeUid: string): Promise<void> {
        await this.driveCache.removeEntities([`node-children-${nodeUid}`]);
    }

    async isFolderChildrenLoaded(nodeUid: string): Promise<boolean> {
        try {
            await this.driveCache.getEntity(`node-children-${nodeUid}`);
            return true;
        } catch {
            return false;
        }
    }
}

function getCacheUid(nodeUid: string) {
    return `node-${nodeUid}`;
}

function getNodeUid(cacheUid: string) {
    if (!cacheUid.startsWith('node-')) {
        throw new Error(`Unexpected cached node uid "${cacheUid}"`);
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
       !node.directMemberRole || typeof node.directMemberRole !== 'string' ||
       !node.type || typeof node.type !== 'string' ||
       (typeof node.mediaType !== 'string' && node.mediaType !== undefined) ||
       typeof node.isShared !== 'boolean' ||
       !node.creationTime || typeof node.creationTime !== 'string' ||
       (typeof node.trashTime !== 'string' && node.trashTime !== undefined) ||
       (typeof node.folder !== 'object' && node.folder !== undefined) ||
       (typeof node.folder?.claimedModificationTime !== 'string' && node.folder?.claimedModificationTime !== undefined)
   ) {
       throw new Error(`Invalid node data: ${nodeData}`);
   }
   return {
       ...node,
       creationTime: new Date(node.creationTime),
       trashTime: node.trashTime ? new Date(node.trashTime) : undefined,
       activeRevision: node.activeRevision ? deserialiseRevision(node.activeRevision) : undefined,
       folder: node.folder
            ? {
                ...node.folder,
                claimedModificationTime: node.folder.claimedModificationTime ? new Date(node.folder.claimedModificationTime) : undefined,
            }
            : undefined,
   };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialiseRevision(revision: any): Result<DecryptedRevision, Error> {
    if (
        (typeof revision !== 'object' && revision !== undefined) ||
        (typeof revision?.creationTime !== 'string' && revision?.creationTime !== undefined)
    ) {
        throw new Error(`Invalid revision data: ${revision}`);
    }

    if (revision.ok) {
        return resultOk({
            ...revision.value,
            creationTime: new Date(revision.value.creationTime),
            claimedModificationTime: new Date(revision.value.claimedModificationTime)
        });
    }

    return revision;
}
