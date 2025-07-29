import { ProtonDriveEntitiesCache } from '../../interface';

export class PhotosCache {
    constructor(private driveCache: ProtonDriveEntitiesCache) {
        this.driveCache = driveCache;
    }

    async setAlbum(album: any) {
        await this.driveCache.setEntity(album.uid, album);
    }
}
