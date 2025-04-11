import { DriveCrypto } from "../../crypto";
import { ProtonDriveTelemetry } from "../../interface";
import { DriveAPIService } from "../apiService";
import { DevicesAPIService } from "./apiService";
import { DevicesCryptoService } from "./cryptoService";
import { SharesService, NodesService, NodesManagementService } from "./interface";
import { DevicesManager } from "./manager";

/**
 * Provides facade for the whole devices module.
 * 
 * The devices module is responsible for handling devices metadata, including
 * API communication, encryption, decryption, caching, and event handling.
 * 
 * This facade provides internal interface that other modules can use to
 * interact with the devices.
 */
export function initDevicesModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    sharesService: SharesService,
    nodesService: NodesService,
    nodesManagementService: NodesManagementService,
) {
    const api = new DevicesAPIService(apiService);
    const cryptoService = new DevicesCryptoService(driveCrypto, sharesService);
    const manager = new DevicesManager(telemetry.getLogger('devices'), api, cryptoService, sharesService, nodesService, nodesManagementService);

    return manager;
}
