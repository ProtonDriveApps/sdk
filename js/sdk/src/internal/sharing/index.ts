import { ProtonDriveAccount, ProtonDriveEntitiesCache, Logger } from "../../interface";
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
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
    driveEvents: DriveEventsService,
    sharesService: SharesService,
    nodesService: NodesService,
    log?: Logger,
) {
    const api = new SharingAPIService(apiService);
    const cache = new SharingCache(driveEntitiesCache);
    const cryptoService = new SharingCryptoService(crypto, account);
    const sharingAccess = new SharingAccess(api, cache, cryptoService, sharesService, nodesService);
    const sharingEvents = new SharingEvents(driveEvents, cache, nodesService, sharingAccess, log);
    const sharingManagement = new SharingManagement(api, cryptoService, sharesService, nodesService, log);

    return {
        access: sharingAccess,
        events: sharingEvents,
        management: sharingManagement,
    };
}
