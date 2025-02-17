import { DriveAPIService } from "../apiService";
import { ProtonDriveEntitiesCache } from "../../interface";
import { PhotosAPIService } from "./apiService";
import { PhotosCache } from "./cache";
import { PhotosTimeline } from "./photosTimeline";
import { Albums } from "./albums";
import { NodesService } from "./interface";

export function initPhotosModule(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    nodesService: NodesService,
) {
    const api = new PhotosAPIService(apiService);
    const cache = new PhotosCache(driveEntitiesCache);
    const timeline = new PhotosTimeline(api, cache, nodesService);
    const albums = new Albums(api, cache, nodesService);

    return {
        timeline,
        albums,
    }
}
