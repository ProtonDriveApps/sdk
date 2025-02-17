import { ProtonDriveEntitiesCache } from "../../interface";

export class PhotosCache {
    constructor(private driveCache: ProtonDriveEntitiesCache) {
        this.driveCache = driveCache;
    }

    setAlbum(album: any) {
        this.driveCache.setEntity(album.uid, album);
    }
}
