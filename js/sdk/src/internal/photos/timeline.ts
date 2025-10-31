import { PhotosAPIService } from './apiService';
import { PhotoSharesManager } from './shares';

/**
 * Provides access to the photo timeline.
 */
export class PhotosTimeline {
    constructor(
        private apiService: PhotosAPIService,
        private photoShares: PhotoSharesManager,
    ) {
        this.apiService = apiService;
        this.photoShares = photoShares;
    }

    async* iterateTimeline(signal?: AbortSignal): AsyncGenerator<{
        nodeUid: string;
        captureTime: Date;
        tags: number[];
    }> {
        const { volumeId } = await this.photoShares.getRootIDs();
        yield* this.apiService.iterateTimeline(volumeId, signal);
    }
}
