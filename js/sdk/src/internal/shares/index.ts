import { ProtonDriveAccount } from "../../interface/index.js";
import { DriveCrypto } from '../../crypto/index.js';
import { DriveAPIService } from "../apiService/index.js";
import { ProtonDriveCache } from "../../cache/index.js";
import { sharesAPIService } from "./apiService.js";
import { sharesCryptoCache } from "./cryptoCache.js";
import { sharesCache } from "./cache.js";
import { sharesCryptoService } from "./cryptoService.js";
import { sharesManager } from "./manager.js";

/**
 * Provides facade for the whole shares module.
 * 
 * The shares module is responsible for handling shares metadata, including
 * API communication, encryption, decryption, caching, and event handling.
 * 
 * This facade provides internal interface that other modules can use to
 * interact with the shares.
 */
export function shares(
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveCache,
    driveCryptoCache: ProtonDriveCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
) {
    const api = sharesAPIService(apiService);
    const cache = sharesCache(driveEntitiesCache);
    const cryptoCache = sharesCryptoCache(driveCryptoCache);
    const cryptoService = sharesCryptoService(crypto, account);
    const sharesFunctions = sharesManager(api, cache, cryptoCache, cryptoService, account);
    return sharesFunctions;
}
