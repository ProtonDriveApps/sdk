import { getConfig } from './config';
import { DriveCrypto, OpenPGPCrypto, SRPModule, SessionKey } from './crypto';
import {
    ProtonDriveHTTPClient,
    ProtonDriveTelemetry,
    ProtonDriveConfig,
    Logger,
    ProtonDriveCryptoCache,
    NodeOrUid,
    ProtonDriveAccount,
    MaybeNode,
} from './interface';
import { Telemetry } from './telemetry';
import { getUid, convertInternalNodePromise, convertInternalNodeIterator } from './transformers';
import { DriveAPIService } from './internal/apiService';
import { SDKEvents } from './internal/sdkEvents';
import { initSharingPublicModule } from './internal/sharingPublic';

/**
 * ProtonDrivePublicLinkClient is the interface for the public link client.
 *
 * The client provides high-level operations for managing nodes, and
 * downloading/uploading files.
 *
 * Do not use this client direclty, use ProtonDriveClient instead.
 * The main client handles public link sessions and provides access to
 * public links.
 *
 * See `experimental.getPublicLinkInfo` and `experimental.authPublicLink`
 * for more information.
 */
export class ProtonDrivePublicLinkClient {
    private logger: Logger;
    private sdkEvents: SDKEvents;
    private sharingPublic: ReturnType<typeof initSharingPublicModule>;

    public experimental: {
        /**
         * Experimental feature to return the URL of the node.
         *
         * Use it when you want to open the node in the ProtonDrive web app.
         *
         * It has hardcoded URLs to open in production client only.
         */
        getNodeUrl: (nodeUid: NodeOrUid) => Promise<string>;
        /**
         * Experimental feature to get the docs key for a node.
         *
         * This is used by Docs app to encrypt and decrypt document updates.
         */
        getDocsKey: (nodeUid: NodeOrUid) => Promise<SessionKey>;
    };

    constructor({
        httpClient,
        cryptoCache,
        account,
        openPGPCryptoModule,
        srpModule,
        config,
        telemetry,
        token,
        password,
    }: {
        httpClient: ProtonDriveHTTPClient;
        cryptoCache: ProtonDriveCryptoCache;
        account: ProtonDriveAccount;
        openPGPCryptoModule: OpenPGPCrypto;
        srpModule: SRPModule;
        config?: ProtonDriveConfig;
        telemetry?: ProtonDriveTelemetry;
        token: string;
        password: string;
    }) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }
        this.logger = telemetry.getLogger('interface');

        const fullConfig = getConfig(config);
        this.sdkEvents = new SDKEvents(telemetry);

        const apiService = new DriveAPIService(
            telemetry,
            this.sdkEvents,
            httpClient,
            fullConfig.baseUrl,
            fullConfig.language,
        );
        const driveCrypto = new DriveCrypto(openPGPCryptoModule, srpModule);
        this.sharingPublic = initSharingPublicModule(
            telemetry,
            apiService,
            cryptoCache,
            driveCrypto,
            account,
            token,
            password,
        );

        this.experimental = {
            getNodeUrl: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting node URL for ${getUid(nodeUid)}`);
                // TODO: public node has different URL
                return '';
            },
            getDocsKey: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting docs keys for ${getUid(nodeUid)}`);
                const keys = await this.sharingPublic.getNodeKeys(getUid(nodeUid));
                if (!keys.contentKeyPacketSessionKey) {
                    throw new Error('Node does not have a content key packet session key');
                }
                return keys.contentKeyPacketSessionKey;
            },
        };
    }

    /**
     * @returns The root folder to the public link.
     */
    async getRootNode(): Promise<MaybeNode> {
        this.logger.info(`Getting root node`);
        return convertInternalNodePromise(this.sharingPublic.getRootNode());
    }

    /**
     * Iterates the children of the given parent node.
     *
     * See `ProtonDriveClient.iterateFolderChildren` for more information.
     */
    async *iterateFolderChildren(parentUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<MaybeNode> {
        this.logger.info(`Iterating children of ${getUid(parentUid)}`);
        yield * convertInternalNodeIterator(this.sharingPublic.iterateFolderChildren(getUid(parentUid), signal));
    }
}
