import { ProtonDriveEntitiesCache, ProtonDriveCryptoCache, ProtonDriveAccount } from "../../interface";
import { DriveCrypto } from '../../crypto';
import { DriveAPIService } from "../apiService";
import { SharesAPIService } from "./apiService";
import { SharesCryptoCache } from "./cryptoCache";
import { SharesCache } from "./cache";
import { SharesCryptoService } from "./cryptoService";
import { SharesManager } from "./manager";

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
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    driveCryptoCache: ProtonDriveCryptoCache,
    account: ProtonDriveAccount,
    crypto: DriveCrypto,
) {
    const api = new SharesAPIService(apiService);
    const cache = new SharesCache(driveEntitiesCache);
    const cryptoCache = new SharesCryptoCache(driveCryptoCache);
    const cryptoService = new SharesCryptoService(crypto, account);
    const sharesManager = new SharesManager(api, cache, cryptoCache, cryptoService, account);
    return sharesManager;
}
