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
import { Albums } from './albums';
import { PhotosAPIService } from './apiService';
import { NodesService, SharesService } from './interface';
import { PhotoSharesManager } from './shares';
import { PhotosTimeline } from './timeline';

/**
 * Provides facade for the whole photos module.
 *
 * The photos module is responsible for handling photos and albums metadata,
 * including API communication, crypto, caching, and event handling.
 */
export function initPhotosModule(
    apiService: DriveAPIService,
    photoShares: PhotoSharesManager,
    nodesService: NodesService,
) {
    const api = new PhotosAPIService(apiService);
    const timeline = new PhotosTimeline(api, photoShares);
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
