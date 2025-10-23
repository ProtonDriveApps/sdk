import { DriveAPIService } from '../apiService';
import { DriveCrypto } from '../../crypto';
import {
    ProtonDriveEntitiesCache,
    ProtonDriveCryptoCache,
    ProtonDriveAccount,
    ProtonDriveTelemetry,
} from '../../interface';
import { NodeAPIService } from './apiService';
import { NodesCache } from './cache';
import { NodesCryptoCache } from './cryptoCache';
import { NodesCryptoService } from './cryptoService';
import { NodesCryptoReporter } from './cryptoReporter';
import { SharesService } from './interface';
import { NodesAccess } from './nodesAccess';
import { NodesManagement } from './nodesManagement';
import { NodesRevisons } from './nodesRevisions';
import { NodesEventsHandler } from './events';

export type { DecryptedNode, DecryptedRevision } from './interface';
export { generateFileExtendedAttributes } from './extendedAttributes';

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
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveEntitiesCache: ProtonDriveEntitiesCache,
    driveCryptoCache: ProtonDriveCryptoCache,
    account: ProtonDriveAccount,
    driveCrypto: DriveCrypto,
    sharesService: SharesService,
    clientUid: string | undefined,
) {
    const api = new NodeAPIService(telemetry.getLogger('nodes-api'), apiService, clientUid);
    const cache = new NodesCache(telemetry.getLogger('nodes-cache'), driveEntitiesCache);
    const cryptoCache = new NodesCryptoCache(telemetry.getLogger('nodes-cache'), driveCryptoCache);
    const cryptoReporter = new NodesCryptoReporter(telemetry, sharesService);
    const cryptoService = new NodesCryptoService(telemetry, driveCrypto, account, cryptoReporter);
    const nodesAccess = new NodesAccess(telemetry, api, cache, cryptoCache, cryptoService, sharesService);
    const nodesEventHandler = new NodesEventsHandler(telemetry.getLogger('nodes-events'), cache);
    const nodesManagement = new NodesManagement(api, cryptoCache, cryptoService, nodesAccess);
    const nodesRevisions = new NodesRevisons(telemetry.getLogger('nodes'), api, cryptoService, nodesAccess);

    return {
        access: nodesAccess,
        management: nodesManagement,
        revisions: nodesRevisions,
        eventHandler: nodesEventHandler,
    };
}
