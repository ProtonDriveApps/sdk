import { ProtonDriveAccount, ProtonDriveEntitiesCache, ProtonDriveTelemetry } from '../../interface';
import { DriveCrypto } from '../../crypto';
import { DriveAPIService } from '../apiService';
import { SharingAPIService } from './apiService';
import { SharingCache } from './cache';
import { SharingCryptoService } from './cryptoService';
import { SharingAccess } from './sharingAccess';
import { SharingManagement } from './sharingManagement';
import { SharesService, NodesService } from './interface';
import { SharingEventHandler } from './events';

/**
 * Provides facade for the whole sharing module.
 *
 * The sharing module is responsible for handling invitations, bookmarks,
 * standard shares, listing shared nodes, etc. It includes API communication,
 * encryption, decryption, caching, and event handling.
 */
export function initSharingModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
    sharesService: SharesService,
    nodesService: NodesService,
) {
    const api = new SharingAPIService(telemetry.getLogger('sharing-api'), apiService);
    const cache = new SharingCache(driveEntitiesCache);
    const cryptoService = new SharingCryptoService(telemetry, crypto, account, sharesService);
    const sharingAccess = new SharingAccess(api, cache, cryptoService, sharesService, nodesService);
    const sharingManagement = new SharingManagement(
        telemetry.getLogger('sharing'),
        api,
        cache,
        cryptoService,
        account,
        sharesService,
        nodesService,
    );
    const sharingEventHandler = new SharingEventHandler(
        telemetry.getLogger('sharing-event-handler'),
        cache,
        sharesService,
    );

    return {
        access: sharingAccess,
        eventHandler: sharingEventHandler,
        management: sharingManagement,
    };
}
