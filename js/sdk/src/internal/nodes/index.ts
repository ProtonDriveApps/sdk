import { DriveAPIService } from "../apiService";
import { ProtonDriveCache } from "../../cache";
import { DriveCrypto } from "../../crypto";
import { DriveEventsService } from "../events";
import { Logger, ProtonDriveAccount } from "../../interface";
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache";
import { nodesEvents } from "./events";
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
    logger?: Logger,
) {
    const api = new NodeAPIService(apiService, logger);
    const cache = new NodesCache(driveEntitiesCache, logger);
    const cryptoCache = new NodesCryptoCache(driveCryptoCache);
    const cryptoService = new NodesCryptoService(driveCrypto, account, sharesService);
    const nodesAccess = new NodesAccess(api, cache, cryptoCache, cryptoService, sharesService);
    const nodesManager = new NodesManager(api, cache, cryptoCache, cryptoService, sharesService, nodesAccess);
    const nodesEventsFunctions = nodesEvents(cache, driveEvents);

    return {
        // TODO: expose in better way
        getNode: nodesAccess.getNode,
        getNodeKeys: nodesAccess.getNodeKeys,
        getMyFilesRootFolder: nodesManager.getMyFilesRootFolder,
        iterateChildren: nodesManager.iterateChildren,
        iterateNodes: nodesManager.iterateNodes,
        ...nodesEventsFunctions,
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
    const nodesAccessFunctions = new NodesAccess(api, cache, cryptoCache, cryptoService, sharesService);
    const nodesManager = new NodesManager(api, cache, cryptoCache, cryptoService, sharesService, nodesAccessFunctions);

    return {
        // TODO: use public root node, not my files
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getPublicRootNode: async (token: string, password: string, customPassword?: string): Promise<DecryptedNode> => { return {} as DecryptedNode },
        getNode: nodesAccessFunctions.getNode,
        getNodeKeys: nodesAccessFunctions.getNodeKeys,
        iterateChildren: nodesManager.iterateChildren,
        iterateNodes: nodesManager.iterateNodes,
    }
}
