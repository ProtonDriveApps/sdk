import { ProtonDriveEntitiesCache, Logger } from "../../interface";
import { getErrorMessage } from "../errors";
import { Volume } from "./interface";

/**
 * Provides caching for shares and volume metadata.
 * 
 * The cache is responsible for serialising and deserialising volume metadata.
 */
export class SharesCache {
    constructor(private logger: Logger, private driveCache: ProtonDriveEntitiesCache) {
        this.logger = logger;
        this.driveCache = driveCache;
    }

    async setVolume(volume: Volume): Promise<void> {
        const key = getCacheUid(volume.volumeId);
        const shareData = serializeVolume(volume);
        await this.driveCache.setEntity(key, shareData);
    }

    async getVolume(volumeId: string): Promise<Volume> {
        const key = getCacheUid(volumeId);
        const volumeData = await this.driveCache.getEntity(key);

        try {
            return deserializeVolume(volumeData);
        } catch (error: unknown) {
            try {
                await this.removeVolume(volumeId);
            } catch (removingError: unknown) {
                this.logger.error('Failed to remove invalid volume from cache', removingError);
            }
            throw new Error(`Failed to deserialize volume: ${getErrorMessage(error)}`);
        }
    }

    async removeVolume(volumeId: string): Promise<void> {
        await this.driveCache.removeEntities([getCacheUid(volumeId)]);
    }
}

function getCacheUid(volumeId: string) {
    return `volume-${volumeId}`;
}

function serializeVolume(volume: Volume) {
    return JSON.stringify(volume);
}

function deserializeVolume(shareData: string): Volume {
     const volume = JSON.parse(shareData);
     if (
        !volume || typeof volume !== 'object' ||
        !volume.volumeId || typeof volume.volumeId !== 'string' ||
        !volume.shareId || typeof volume.shareId !== 'string' ||
        !volume.rootNodeId || typeof volume.rootNodeId !== 'string' ||
        !volume.creatorEmail || typeof volume.creatorEmail !== 'string' ||
        !volume.addressId || typeof volume.addressId !== 'string'
    ) {
        throw new Error('Invalid volume data');
    }
    return volume;
}