import { DriveCrypto } from '../../crypto';
import {
    ProtonDriveCryptoCache,
    ProtonDriveTelemetry,
    ProtonDriveAccount,
    ProtonDriveEntitiesCache,
} from '../../interface';
import { DriveAPIService } from '../apiService';
import { NodeAPIService } from '../nodes/apiService';
import { NodesCache } from '../nodes/cache';
import { NodesCryptoCache } from '../nodes/cryptoCache';
import { NodesCryptoService } from '../nodes/cryptoService';
import { NodesRevisons } from '../nodes/nodesRevisions';
import { SharingPublicAPIService } from './apiService';
import { SharingPublicCryptoCache } from './cryptoCache';
import { SharingPublicCryptoReporter } from './cryptoReporter';
import { SharingPublicCryptoService } from './cryptoService';
import { SharingPublicNodesAccess } from './nodes';
import { SharingPublicSharesManager } from './shares';

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
    driveEntitiesCache: ProtonDriveEntitiesCache,
    driveCryptoCache: ProtonDriveCryptoCache,
    driveCrypto: DriveCrypto,
    account: ProtonDriveAccount,
    url: string,
    token: string,
    password: string,
) {
    const api = new SharingPublicAPIService(telemetry.getLogger('sharingPublic-api'), apiService);
    const cryptoCache = new SharingPublicCryptoCache(telemetry.getLogger('sharingPublic-crypto'), driveCryptoCache);
    const cryptoService = new SharingPublicCryptoService(driveCrypto, password);
    const shares = new SharingPublicSharesManager(api, cryptoCache, cryptoService, account, token);
    const nodes = initSharingPublicNodesModule(
        telemetry,
        apiService,
        driveEntitiesCache,
        driveCryptoCache,
        driveCrypto,
        account,
        shares,
        url,
        token,
    );

    return {
        shares,
        nodes,
    };
}

/**
 * Provides facade for the public link nodes module.
 *
 * The public link nodes initializes the core nodes module, but uses public
 * link shares or crypto reporter instead.
 */
export function initSharingPublicNodesModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    driveCryptoCache: ProtonDriveCryptoCache,
    driveCrypto: DriveCrypto,
    account: ProtonDriveAccount,
    sharesService: SharingPublicSharesManager,
    url: string,
    token: string,
) {
    const api = new NodeAPIService(telemetry.getLogger('nodes-api'), apiService);
    const cache = new NodesCache(telemetry.getLogger('nodes-cache'), driveEntitiesCache);
    const cryptoCache = new NodesCryptoCache(telemetry.getLogger('nodes-cache'), driveCryptoCache);
    const cryptoReporter = new SharingPublicCryptoReporter(telemetry);
    const cryptoService = new NodesCryptoService(telemetry, driveCrypto, account, cryptoReporter);
    const nodesAccess = new SharingPublicNodesAccess(
        telemetry,
        api,
        cache,
        cryptoCache,
        cryptoService,
        sharesService,
        url,
        token,
    );
    const nodesRevisions = new NodesRevisons(telemetry.getLogger('nodes'), api, cryptoService, nodesAccess);

    return {
        access: nodesAccess,
        revisions: nodesRevisions,
    };
}
