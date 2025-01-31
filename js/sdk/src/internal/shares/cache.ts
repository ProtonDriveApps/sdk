import { ProtonDriveCache, EntityResult } from "../../cache/index.js";
import { Volume } from "./interface.js";

/**
 * Provides caching for shares and volume metadata.
 * 
 * The cache is responsible for serialising and deserialising volume metadata.
 */
export function sharesCache(driveCache: ProtonDriveCache) {
    async function setVolume(volume: Volume) {
        const key = getCacheUid(volume.volumeId);
        const shareData = serializeVolume(volume);
        driveCache.setEntity(key, shareData);
    }

    async function getVolume(volumeId: string): Promise<Volume> {
        const key = getCacheUid(volumeId);
        const volumeData = await driveCache.getEntity(key);

        try {
            return deserializeVolume(volumeData);
        } catch (error: any) {
            try {
                await removeVolume(volumeId);
            } catch (error: any) {
                // TODO: log error
            }
            throw new Error(`Failed to deserialize volume: ${error.message}`);
        }
    }

    async function removeVolume(volumeId: string) {
        await driveCache.removeEntities([getCacheUid(volumeId)]);
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
            !volume.creatorEmail || typeof volume.creatorEmail !== 'string'
        ) {
            throw new Error('Invalid volume data');
        }
        return volume;
    }

    return {
        setVolume,
        getVolume,
        removeVolume,
    }
}
