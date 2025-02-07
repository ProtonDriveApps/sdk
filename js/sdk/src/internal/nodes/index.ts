import { DriveAPIService } from "../apiService";
import { ProtonDriveCache } from "../../cache";
import { DriveCrypto } from "../../crypto";
import { DriveEventsService } from "../events";
import { Logger, ProtonDriveAccount } from "../../interface";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache";
import { NodesEvents } from "./events";
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { SharesService, DecryptedNode } from "./interface";
import { NodesAccess } from "./nodesAccess";
import { NodesManager } from "./manager";

export type { DecryptedNode } from "./interface";

/**
 * Provides facade for the whole nodes module.
 * 
 * The nodes module is responsible for handling node metadata, including
 * API communication, encryption, decryption, caching, and event handling.
 * 
 * This facade provides internal interface that other modules can use to
 * interact with the nodes.
 */
export function initNodesModule(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveCache,
    driveCryptoCache: ProtonDriveCache,
    account: ProtonDriveAccount,
    driveCrypto: DriveCrypto,
    driveEvents: DriveEventsService,
    sharesService: SharesService,
    log?: Logger,
) {
    const api = new NodeAPIService(apiService, log);
    const cache = new NodesCache(driveEntitiesCache, log);
    const cryptoCache = new NodesCryptoCache(driveCryptoCache);
    const cryptoService = new NodesCryptoService(driveCrypto, account, sharesService);
    const nodesAccess = new NodesAccess(api, cache, cryptoCache, cryptoService, sharesService);
    const nodesEvents = new NodesEvents(driveEvents, cache, nodesAccess, log);
    // TODO: Events are sent to the client once event is received from API
    // If change is done locally, it will take a time to show up if client
    // is waiting with UI update to events. Thus we need to emit events
    // right away.
    const nodesManager = new NodesManager(api, cache, cryptoCache, cryptoService, sharesService, nodesAccess);

    return {
        access: nodesAccess,
        management: nodesManager,
        events: nodesEvents,
    }
}

export function initPublicNodesModule(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveCache,
    driveCryptoCache: ProtonDriveCache,
    driveCrypto: DriveCrypto,
    sharesService: SharesService,
) {
    // TODO: create public node API service
    const api = new NodeAPIService(apiService);
    const cache = new NodesCache(driveEntitiesCache);
    const cryptoCache = new NodesCryptoCache(driveCryptoCache);
    // @ts-expect-error TODO
    const cryptoService = new NodesCryptoService(driveCrypto, account, sharesService);
    const nodesAccess = new NodesAccess(api, cache, cryptoCache, cryptoService, sharesService);
    const nodesManager = new NodesManager(api, cache, cryptoCache, cryptoService, sharesService, nodesAccess);

    return {
        // TODO: use public root node, not my files
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getPublicRootNode: async (token: string, password: string, customPassword?: string): Promise<DecryptedNode> => { return {} as DecryptedNode },
        access: nodesAccess,
        management: nodesManager,
    }
}
