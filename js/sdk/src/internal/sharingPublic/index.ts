import { DriveCrypto, PrivateKey } from '../../crypto';
import {
    ProtonDriveCryptoCache,
    ProtonDriveTelemetry,
    ProtonDriveAccount,
    ProtonDriveEntitiesCache,
    MemberRole,
} from '../../interface';
import { DriveAPIService } from '../apiService';
import { SharingPublicNodesAPIService, SharingPublicNodesCryptoService } from './nodes';
import { NodesCache } from '../nodes/cache';
import { NodesCryptoCache } from '../nodes/cryptoCache';
import { NodesRevisons } from '../nodes/nodesRevisions';
import { SharingPublicCryptoReporter } from './cryptoReporter';
import { SharingPublicNodesAccess, SharingPublicNodesManagement } from './nodes';
import { SharingPublicSharesManager } from './shares';
import { SharingPublicAPIService } from './apiService';
import { NodesSecurity } from './nodesSecurity';

export { SharingPublicSessionManager } from './session/manager';
export { getTokenAndPasswordFromUrl } from './session/url';
export { UnauthDriveAPIService } from './unauthApiService';

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
    publicShareKey: PrivateKey,
    publicRootNodeUid: string,
    publicRole: MemberRole,
    isAnonymousContext: boolean,
) {
    const shares = new SharingPublicSharesManager(account, publicShareKey, publicRootNodeUid);
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
        publicShareKey,
        publicRootNodeUid,
        publicRole,
        isAnonymousContext,
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
    publicShareKey: PrivateKey,
    publicRootNodeUid: string,
    publicRole: MemberRole,
    isAnonymousContext: boolean,
) {
    const clientUid = undefined; // No client UID for public context yet.
    const api = new SharingPublicNodesAPIService(
        telemetry.getLogger('nodes-api'),
        apiService,
        clientUid,
        publicRootNodeUid,
        publicRole,
        token,
    );
    const cache = new NodesCache(telemetry.getLogger('nodes-cache'), driveEntitiesCache);
    const cryptoCache = new NodesCryptoCache(telemetry.getLogger('nodes-cache'), driveCryptoCache);
    const cryptoReporter = new SharingPublicCryptoReporter(telemetry);
    const cryptoService = new SharingPublicNodesCryptoService(telemetry, driveCrypto, account, cryptoReporter);
    const nodesAccess = new SharingPublicNodesAccess(
        telemetry,
        api,
        cache,
        cryptoCache,
        cryptoService,
        sharesService,
        url,
        token,
        publicShareKey,
        publicRootNodeUid,
        isAnonymousContext,
    );
    const nodesManagement = new SharingPublicNodesManagement(api, cryptoCache, cryptoService, nodesAccess);
    const nodesRevisions = new NodesRevisons(telemetry.getLogger('nodes'), api, cryptoService, nodesAccess);
    const sharingPublicApi = new SharingPublicAPIService(apiService);
    const nodesSecurity = new NodesSecurity(sharingPublicApi, token);

    return {
        access: nodesAccess,
        management: nodesManagement,
        revisions: nodesRevisions,
        security: nodesSecurity,
    };
}
