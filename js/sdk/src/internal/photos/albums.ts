import { PhotosAPIService } from "./apiService";
import { PhotosCache } from "./cache";
import { NodesService } from "./interface";

export class Albums {
    constructor(
        private apiService: PhotosAPIService,
        private cache: PhotosCache,
        private nodesService: NodesService,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.nodesService = nodesService;
    }

    async* iterateAlbums() {
        for await (const album of this.apiService.iterateAlbums()) {
            const node = await this.nodesService.getNode(album.uid);
            yield {
                node,
            }
        }
    }

    async createAlbum(albumName: string) {
        const albumdUid = this.apiService.createAlbum(albumName);
        this.cache.setAlbum(albumdUid);
    }
}
