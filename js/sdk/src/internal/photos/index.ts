import { DriveAPIService } from '../apiService';
import { DriveCrypto } from '../../crypto';
import {
    ProtonDriveAccount,
    ProtonDriveCryptoCache,
    ProtonDriveEntitiesCache,
    ProtonDriveTelemetry,
} from '../../interface';
import { SharesCache } from '../shares/cache';
import { SharesCryptoCache } from '../shares/cryptoCache';
import { SharesCryptoService } from '../shares/cryptoService';
import { NodesService as UploadNodesService } from '../upload/interface';
import { UploadTelemetry } from '../upload/telemetry';
import { UploadQueue } from '../upload/queue';
import { Albums } from './albums';
import { PhotosAPIService } from './apiService';
import { NodesService, SharesService } from './interface';
import { PhotoSharesManager } from './shares';
import { PhotosTimeline } from './timeline';
import {
    PhotoFileUploader,
    PhotoUploadAPIService,
    PhotoUploadCryptoService,
    PhotoUploadManager,
    PhotoUploadMetadata,
} from './upload';
import { ShareTargetType } from '../shares';

// Only photos and albums can be shared in photos volume.
export const PHOTOS_SHARE_TARGET_TYPES = [ShareTargetType.Photo, ShareTargetType.Album];

/**
 * Provides facade for the whole photos module.
 *
 * The photos module is responsible for handling photos and albums metadata,
 * including API communication, crypto, caching, and event handling.
 */
export function initPhotosModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    photoShares: PhotoSharesManager,
    nodesService: NodesService,
) {
    const api = new PhotosAPIService(apiService);
    const timeline = new PhotosTimeline(
        telemetry.getLogger('photos-timeline'),
        api,
        driveCrypto,
        photoShares,
        nodesService,
    );
    const albums = new Albums(api, photoShares, nodesService);

    return {
        timeline,
        albums,
    };
}

/**
 * Provides facade for the photo share module.
 *
 * The photo share wraps the core share module, but uses photos volume instead
 * of main volume. It provides the same interface so it can be used in the same
 * way in various modules that use shares.
 */
export function initPhotoSharesModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    driveCryptoCache: ProtonDriveCryptoCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
    sharesService: SharesService,
) {
    const api = new PhotosAPIService(apiService);
    const cache = new SharesCache(telemetry.getLogger('shares-cache'), driveEntitiesCache);
    const cryptoCache = new SharesCryptoCache(telemetry.getLogger('shares-cache'), driveCryptoCache);
    const cryptoService = new SharesCryptoService(telemetry, crypto, account);

    return new PhotoSharesManager(
        telemetry.getLogger('photos-shares'),
        api,
        cache,
        cryptoCache,
        cryptoService,
        sharesService,
    );
}

/**
 * Provides facade for the photo upload module.
 *
 * The photo upload wraps the core upload module and adds photo specific metadata.
 * It provides the same interface so it can be used in the same way.
 */
export function initPhotoUploadModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    sharesService: SharesService,
    nodesService: UploadNodesService,
    clientUid?: string,
) {
    const api = new PhotoUploadAPIService(apiService, clientUid);
    const cryptoService = new PhotoUploadCryptoService(driveCrypto, nodesService);

    const uploadTelemetry = new UploadTelemetry(telemetry, sharesService);
    const manager = new PhotoUploadManager(telemetry, api, cryptoService, nodesService, clientUid);

    const queue = new UploadQueue();

    async function getFileUploader(
        parentFolderUid: string,
        name: string,
        metadata: PhotoUploadMetadata,
        signal?: AbortSignal,
    ): Promise<PhotoFileUploader> {
        await queue.waitForCapacity(signal);

        const onFinish = () => {
            queue.releaseCapacity();
        };

        return new PhotoFileUploader(
            uploadTelemetry,
            api,
            cryptoService,
            manager,
            parentFolderUid,
            name,
            metadata,
            onFinish,
            signal,
        );
    }

    return {
        getFileUploader,
    };
}
