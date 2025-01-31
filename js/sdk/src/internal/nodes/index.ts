import { DriveAPIService } from "../apiService";
import { ProtonDriveCache } from "../../cache";
import { DriveCrypto } from "../../crypto";
import { DriveEventsService } from "../events";
import { Logger, ProtonDriveAccount } from "../../interface";
import { nodeAPIService } from "./apiService";
import { nodesCache } from "./cache";
import { nodesEvents } from "./events";
import { nodesCryptoCache } from "./cryptoCache";
import { nodesCryptoService } from "./cryptoService";
import { SharesService, DecryptedNode } from "./interface";
import { nodesAccess } from "./nodesAccess";
import { nodesManager } from "./manager";

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
export function nodes(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveCache,
    driveCryptoCache: ProtonDriveCache,
    account: ProtonDriveAccount,
    driveCrypto: DriveCrypto,
    driveEvents: DriveEventsService,
    sharesService: SharesService,
    logger?: Logger,
) {
    const api = nodeAPIService(apiService, logger);
    const cache = nodesCache(driveEntitiesCache, logger);
    const cryptoCache = nodesCryptoCache(driveCryptoCache);
    const cryptoService = nodesCryptoService(driveCrypto, account, sharesService);
    const nodesAccessFunctions = nodesAccess(api, cache, cryptoCache, cryptoService, sharesService);
    const nodesFunctions = nodesManager(api, cache, cryptoCache, cryptoService, sharesService, nodesAccessFunctions);
    const nodesEventsFunctions = nodesEvents(cache, driveEvents);

    return {
        getNode: nodesAccessFunctions.getNode,
        getNodeKeys: nodesAccessFunctions.getNodeKeys,
        ...nodesFunctions,
        ...nodesEventsFunctions,
    }
}

export function publicNodes(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveCache,
    driveCryptoCache: ProtonDriveCache,
    driveCrypto: DriveCrypto,
    sharesService: SharesService,
) {
    // TODO: create public node API service
    const api = nodeAPIService(apiService);
    const cache = nodesCache(driveEntitiesCache);
    const cryptoCache = nodesCryptoCache(driveCryptoCache);
    // @ts-expect-error TODO
    const cryptoService = nodesCryptoService(driveCrypto);
    const nodesAccessFunctions = nodesAccess(api, cache, cryptoCache, cryptoService, sharesService);
    const nodesListingFunctions = nodesManager(api, cache, cryptoCache, cryptoService, sharesService, nodesAccessFunctions);

    return {
        // TODO: use public root node, not my files
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getPublicRootNode: async (token: string, password: string, customPassword?: string): Promise<DecryptedNode> => { return {} as DecryptedNode },
        getNode: nodesAccessFunctions.getNode,
        getNodeKeys: nodesAccessFunctions.getNodeKeys,
        iterateChildren: nodesListingFunctions.iterateChildren,
        iterateNodes: nodesListingFunctions.iterateNodes,
    }
}
