import { ProtonDriveAccount, ProtonDriveEntitiesCache, ProtonDriveTelemetry } from "../../interface";
import { DriveCrypto } from '../../crypto';
import { DriveAPIService } from "../apiService";
import { DriveEventsService } from "../events";
import { SharingAPIService } from "./apiService";
import { SharingCache } from "./cache";
import { SharingCryptoService } from "./cryptoService";
import { SharingEvents } from "./events";
import { SharingAccess } from "./sharingAccess";
import { SharingManagement } from "./sharingManagement";
import { SharesService, NodesService } from "./interface";

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
    driveEvents: DriveEventsService,
    sharesService: SharesService,
    nodesService: NodesService,
) {
    const api = new SharingAPIService(telemetry.getLogger('sharing-api'), apiService);
    const cache = new SharingCache(driveEntitiesCache);
    const cryptoService = new SharingCryptoService(crypto, account);
    const sharingAccess = new SharingAccess(api, cache, cryptoService, sharesService, nodesService);
    const sharingEvents = new SharingEvents(telemetry.getLogger('sharing-events'), driveEvents, cache, nodesService, sharingAccess);
    const sharingManagement = new SharingManagement(telemetry.getLogger('sharing'), api, cryptoService, account, sharesService, nodesService);

    return {
        access: sharingAccess,
        events: sharingEvents,
        management: sharingManagement,
    };
}
