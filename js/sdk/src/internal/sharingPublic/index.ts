import { DriveCrypto } from '../../crypto';
import { ProtonDriveCryptoCache, ProtonDriveTelemetry, ProtonDriveAccount } from '../../interface';
import { DriveAPIService } from '../apiService';
import { SharingPublicAPIService } from './apiService';
import { SharingPublicCryptoCache } from './cryptoCache';
import { SharingPublicCryptoService } from './cryptoService';
import { SharingPublicManager } from './manager';

export { SharingPublicSessionManager } from './session/manager';

/**
 * Provides facade for the whole sharing public module.
 *
 * The sharing public module is responsible for handling public link data, including
 * API communication, encryption, decryption, and caching.
 *
 * This facade provides internal interface that other modules can use to
 * interact with the public links.
 */
export function initSharingPublicModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCryptoCache: ProtonDriveCryptoCache,
    driveCrypto: DriveCrypto,
    account: ProtonDriveAccount,
    token: string,
    password: string,
) {
    const api = new SharingPublicAPIService(telemetry.getLogger('sharingPublic-api'), apiService);
    const cryptoCache = new SharingPublicCryptoCache(telemetry.getLogger('sharingPublic-crypto'), driveCryptoCache);
    const cryptoService = new SharingPublicCryptoService(telemetry, driveCrypto, account, password);
    const manager = new SharingPublicManager(
        telemetry.getLogger('sharingPublic-nodes'),
        api,
        cryptoCache,
        cryptoService,
        token,
    );

    return manager;
}
