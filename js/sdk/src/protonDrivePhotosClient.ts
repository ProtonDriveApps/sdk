import { DriveAPIService } from './internal/apiService';
import { ProtonDriveClientContructorParameters } from './interface';
import { DriveCrypto } from './crypto';
import { initSharesModule } from './internal/shares';
import { initNodesModule } from './internal/nodes';
import { initPhotosModule } from './internal/photos';
import { DriveEventsService } from './internal/events';
import { SDKEvents } from './internal/sdkEvents';
import { getConfig } from './config';
import { Telemetry } from './telemetry';

// TODO: this is only example, on background it use drive internals, but it exposes nice interface for photos
export class ProtonDrivePhotosClient {
    private nodes: ReturnType<typeof initNodesModule>;
    private photos: ReturnType<typeof initPhotosModule>;

    constructor({
        httpClient,
        entitiesCache,
        cryptoCache,
        account,
        openPGPCryptoModule,
        srpModule,
        config,
        telemetry,
    }: ProtonDriveClientContructorParameters) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }

        const fullConfig = getConfig(config);
        const sdkEvents = new SDKEvents(telemetry);
        const cryptoModule = new DriveCrypto(openPGPCryptoModule, srpModule);
        const apiService = new DriveAPIService(telemetry, sdkEvents, httpClient, fullConfig.baseUrl, fullConfig.language);
        const events = new DriveEventsService(telemetry, apiService, entitiesCache);
        const shares = initSharesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initNodesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule, events, shares);
        this.photos = initPhotosModule(apiService, entitiesCache, this.nodes.access);
    }

    // Timeline or album view
    iterateTimelinePhotos() { } // returns only UIDs and dates - used to show grid and scrolling
    iterateAlbumPhotos() { } // same as above but for album
    iterateThumbnails() { } // returns thumbnails for passed photos that are visible in the UI
    getPhoto() { } // returns full photo details

    // Album management
    createAlbum(albumName: string) {
        return this.photos.albums.createAlbum(albumName);
    }
    renameAlbum() { }
    shareAlbum() { }
    deleteAlbum() { }
    iterateAlbums() { }
    addPhotosToAlbum() { }
}
