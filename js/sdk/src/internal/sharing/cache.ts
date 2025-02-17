import { ProtonDriveEntitiesCache } from "../../interface";
import { SharingType } from "./interface";

/**
 * Provides caching for shared by me and with me listings.
 * 
 * The cache is responsible for serialising and deserialising the node
 * UIDs for each sharing type. Also, ensuring that only full lists are
 * cached.
 */
export class SharingCache {
    /**
     * Locally cached data to avoid unnecessary reads from the cache.
     */
    private cache: Map<SharingType, string[]> = new Map();

    constructor(private driveCache: ProtonDriveEntitiesCache) {
        this.driveCache = driveCache;
    }

    async getSharedByMeNodeUids(): Promise<string[]> {
        return this.getNodeUids(SharingType.SharedByMe);
    }

    async addSharedByMeNodeUid(nodeUid: string): Promise<void> {
        return this.addNodeUid(SharingType.SharedByMe, nodeUid);
    }

    async removeSharedByMeNodeUid(nodeUid: string): Promise<void> {
        return this.removeNodeUid(SharingType.SharedByMe, nodeUid);
    }

    async setSharedByMeNodeUids(nodeUids: string[]): Promise<void> {
        return this.setNodeUids(SharingType.SharedByMe, nodeUids);
    }

    async getSharedWithMeNodeUids(): Promise<string[]> {
        return this.getNodeUids(SharingType.sharedWithMe);
    }

    async setSharedWithMeNodeUids(nodeUids: string[] | undefined): Promise<void> {
        return this.setNodeUids(SharingType.sharedWithMe, nodeUids);
    }

    /**
     * @throws Error if the cache is not set yet. First, the cache should be
     *        set by calling `setNodeUids` after full loading of the list.
     */
    private async addNodeUid(type: SharingType, nodeUid: string): Promise<void> {
        let nodeUids;
        try {
            nodeUids = await this.getNodeUids(type);
        } catch {
            throw new Error('Calling add before setting the loaded items');
        }
        const set = new Set(nodeUids);
        if (set.has(nodeUid)) {
            return;
        }
        set.add(nodeUid);
        await this.setNodeUids(type, [...set]);
    }

    /**
     * @throws Error if the cache is not set yet. First, the cache should be
     *        set by calling `setNodeUids` after full loading of the list.
     */
    private async removeNodeUid(type: SharingType, nodeUid: string): Promise<void> {
        let nodeUids;
        try {
            nodeUids = await this.getNodeUids(type);
        } catch {
            throw new Error('Calling remove before setting the loaded items');
        }
        const set = new Set(nodeUids);
        if (!set.has(nodeUid)) {
            return;
        }
        set.delete(nodeUid);
        await this.setNodeUids(type, [...set]);
    }

    private async getNodeUids(type: SharingType): Promise<string[]> {
        let nodeUids = this.cache.get(type);
        if (nodeUids) {
            return nodeUids;
        }

        const nodeUidsString = await this.driveCache.getEntity(`sharing-${type}-nodeUids`);
        nodeUids = nodeUidsString.split(',');
        this.cache.set(type, nodeUids);
        return nodeUids;
    }

    /**
     * @param nodeUids - Passing `undefined` will remove the cache.
     */
    private async setNodeUids(type: SharingType, nodeUids: string[] | undefined): Promise<void> {
        if (nodeUids) {
            this.cache.set(type, nodeUids);
            await this.driveCache.setEntity(`sharing-${type}-nodeUids`, nodeUids.join(','));
        } else {
            this.cache.delete(type);
            await this.driveCache.removeEntities([`sharing-${type}-nodeUids`]);
        }
    }
}
