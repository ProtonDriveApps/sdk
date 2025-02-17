import { DriveAPIService } from "../apiService/index.js";

export class PhotosAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async* iterateTimeline(): AsyncGenerator<any> {
    }

    async* iterateAlbums(): AsyncGenerator<any> {
    }

    async createAlbum(object: any): Promise<any> {
    }
}
