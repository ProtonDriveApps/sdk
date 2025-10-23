import {
    ProtonDriveEntitiesCache,
    ProtonDriveCryptoCache,
    ProtonDriveAccount,
    ProtonDriveTelemetry,
} from '../../interface';
import { DriveCrypto } from '../../crypto';
import { DriveAPIService } from '../apiService';
import { SharesAPIService } from './apiService';
import { SharesCryptoCache } from './cryptoCache';
import { SharesCache } from './cache';
import { SharesCryptoService } from './cryptoService';
import { SharesManager } from './manager';

export { ShareTargetType } from './interface';
export type { EncryptedShare } from './interface';

/**
 * Provides facade for the whole shares module.
 *
 * The shares module is responsible for handling shares metadata, including
 * API communication, encryption, decryption, caching, and event handling.
 *
 * This facade provides internal interface that other modules can use to
 * interact with the shares.
 */
export function initSharesModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    driveCryptoCache: ProtonDriveCryptoCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
) {
    const api = new SharesAPIService(apiService);
    const cache = new SharesCache(telemetry.getLogger('shares-cache'), driveEntitiesCache);
    const cryptoCache = new SharesCryptoCache(telemetry.getLogger('shares-cache'), driveCryptoCache);
    const cryptoService = new SharesCryptoService(telemetry, crypto, account);
    const sharesManager = new SharesManager(
        telemetry.getLogger('shares'),
        api,
        cache,
        cryptoCache,
        cryptoService,
        account,
    );
    return sharesManager;
}
