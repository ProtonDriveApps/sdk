import { PhotosAPIService } from "./apiService";
import { PhotosCache } from "./cache";
import { NodesService } from "./interface";

export class PhotosTimeline {
    constructor(
        private apiService: PhotosAPIService,
        private cache: PhotosCache,
        private nodesService: NodesService,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.nodesService = nodesService;
    }

    async getTimelineStructure() {
    }
}
