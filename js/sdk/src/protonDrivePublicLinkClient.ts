import { MemoryCache } from './cache';
import { getConfig } from './config';
import { DriveCrypto, OpenPGPCrypto, PrivateKey, SRPModule, SessionKey } from './crypto';
import {
    ProtonDriveHTTPClient,
    ProtonDriveTelemetry,
    ProtonDriveConfig,
    Logger,
    NodeOrUid,
    ProtonDriveAccount,
    MaybeNode,
    NodeType,
    CachedCryptoMaterial,
    MaybeMissingNode,
    FileDownloader,
    ThumbnailType,
    ThumbnailResult,
    UploadMetadata,
    FileUploader,
    NodeResult,
} from './interface';
import { Telemetry } from './telemetry';
import {
    getUid,
    convertInternalNodePromise,
    convertInternalNodeIterator,
    convertInternalMissingNodeIterator,
    getUids,
} from './transformers';
import { DriveAPIService } from './internal/apiService';
import { initDownloadModule } from './internal/download';
import { SDKEvents } from './internal/sdkEvents';
import { initSharingPublicModule } from './internal/sharingPublic';
import { initUploadModule } from './internal/upload';

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
    private download: ReturnType<typeof initDownloadModule>;
    private upload: ReturnType<typeof initUploadModule>;

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
        account,
        openPGPCryptoModule,
        srpModule,
        config,
        telemetry,
        url,
        token,
        publicShareKey,
        publicRootNodeUid,
    }: {
        httpClient: ProtonDriveHTTPClient;
        account: ProtonDriveAccount;
        openPGPCryptoModule: OpenPGPCrypto;
        srpModule: SRPModule;
        config?: ProtonDriveConfig;
        telemetry?: ProtonDriveTelemetry;
        url: string;
        token: string;
        publicShareKey: PrivateKey;
        publicRootNodeUid: string;
    }) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }
        this.logger = telemetry.getLogger('publicLink-interface');

        // Use only in memory cache for public link as there are no events to keep it up to date if persisted.
        const entitiesCache = new MemoryCache<string>();
        const cryptoCache = new MemoryCache<CachedCryptoMaterial>();

        const fullConfig = getConfig(config);
        this.sdkEvents = new SDKEvents(telemetry);

        const apiService = new DriveAPIService(
            telemetry,
            this.sdkEvents,
            httpClient,
            fullConfig.baseUrl,
            fullConfig.language,
        );
        const cryptoModule = new DriveCrypto(openPGPCryptoModule, srpModule);
        this.sharingPublic = initSharingPublicModule(
            telemetry,
            apiService,
            entitiesCache,
            cryptoCache,
            cryptoModule,
            account,
            url,
            token,
            publicShareKey,
            publicRootNodeUid,
        );
        this.download = initDownloadModule(
            telemetry,
            apiService,
            cryptoModule,
            account,
            this.sharingPublic.shares,
            this.sharingPublic.nodes.access,
            this.sharingPublic.nodes.revisions,
        );
        this.upload = initUploadModule(
            telemetry,
            apiService,
            cryptoModule,
            this.sharingPublic.shares,
            this.sharingPublic.nodes.access,
            fullConfig.clientUid,
        );

        this.experimental = {
            getNodeUrl: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting node URL for ${getUid(nodeUid)}`);
                return this.sharingPublic.nodes.access.getNodeUrl(getUid(nodeUid));
            },
            getDocsKey: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting docs keys for ${getUid(nodeUid)}`);
                const keys = await this.sharingPublic.nodes.access.getNodeKeys(getUid(nodeUid));
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
        const { rootNodeUid } = await this.sharingPublic.shares.getOwnVolumeIDs();
        return convertInternalNodePromise(this.sharingPublic.nodes.access.getNode(rootNodeUid));
    }

    /**
     * Iterates the children of the given parent node.
     *
     * See `ProtonDriveClient.iterateFolderChildren` for more information.
     */
    async *iterateFolderChildren(
        parentUid: NodeOrUid,
        filterOptions?: { type?: NodeType },
        signal?: AbortSignal,
    ): AsyncGenerator<MaybeNode> {
        this.logger.info(`Iterating children of ${getUid(parentUid)}`);
        yield* convertInternalNodeIterator(
            this.sharingPublic.nodes.access.iterateFolderChildren(getUid(parentUid), filterOptions, signal),
        );
    }

    /**
     * Iterates the nodes by their UIDs.
     *
     * See `ProtonDriveClient.iterateNodes` for more information.
     */
    async *iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<MaybeMissingNode> {
        this.logger.info(`Iterating ${nodeUids.length} nodes`);
        yield* convertInternalMissingNodeIterator(
            this.sharingPublic.nodes.access.iterateNodes(getUids(nodeUids), signal),
        );
    }

    /**
     * Get the node by its UID.
     *
     * See `ProtonDriveClient.getNode` for more information.
     */
    async getNode(nodeUid: NodeOrUid): Promise<MaybeNode> {
        this.logger.info(`Getting node ${getUid(nodeUid)}`);
        return convertInternalNodePromise(this.sharingPublic.nodes.access.getNode(getUid(nodeUid)));
    }

    /**
     * Rename the node.
     *
     * See `ProtonDriveClient.renameNode` for more information.
     */
    async renameNode(nodeUid: NodeOrUid, newName: string): Promise<MaybeNode> {
        this.logger.info(`Renaming node ${getUid(nodeUid)}`);
        return convertInternalNodePromise(this.sharingPublic.nodes.management.renameNode(getUid(nodeUid), newName));
    }

    /**
     * Delete the nodes permanently.
     *
     * See `ProtonDriveClient.deleteNodes` for more information.
     */
    async *deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Deleting ${nodeUids.length} nodes`);
        yield* this.sharingPublic.nodes.management.deleteNodes(getUids(nodeUids), signal);
    }

    /**
     * Create a new folder.
     *
     * See `ProtonDriveClient.createFolder` for more information.
     */
    async createFolder(parentNodeUid: NodeOrUid, name: string, modificationTime?: Date): Promise<MaybeNode> {
        this.logger.info(`Creating folder in ${getUid(parentNodeUid)}`);
        return convertInternalNodePromise(
            this.sharingPublic.nodes.management.createFolder(getUid(parentNodeUid), name, modificationTime),
        );
    }

    /**
     * Get the file downloader to download the node content.
     *
     * See `ProtonDriveClient.getFileDownloader` for more information.
     */
    async getFileDownloader(nodeUid: NodeOrUid, signal?: AbortSignal): Promise<FileDownloader> {
        this.logger.info(`Getting file downloader for ${getUid(nodeUid)}`);
        return this.download.getFileDownloader(getUid(nodeUid), signal);
    }

    /**
     * Iterates the thumbnails of the given nodes.
     *
     * See `ProtonDriveClient.iterateThumbnails` for more information.
     */
    async *iterateThumbnails(
        nodeUids: NodeOrUid[],
        thumbnailType?: ThumbnailType,
        signal?: AbortSignal,
    ): AsyncGenerator<ThumbnailResult> {
        this.logger.info(`Iterating ${nodeUids.length} thumbnails`);
        yield* this.download.iterateThumbnails(getUids(nodeUids), thumbnailType, signal);
    }

    /**
     * Get the file uploader to upload a new file. For uploading a new
     * revision, use `getFileRevisionUploader` instead.
     *
     * See `ProtonDriveClient.getFileUploader` for more information.
     */
    async getFileUploader(
        parentFolderUid: NodeOrUid,
        name: string,
        metadata: UploadMetadata,
        signal?: AbortSignal,
    ): Promise<FileUploader> {
        this.logger.info(`Getting file uploader for parent ${getUid(parentFolderUid)}`);
        return this.upload.getFileUploader(getUid(parentFolderUid), name, metadata, signal);
    }

    /**
     * Same as `getFileUploader`, but for a uploading new revision of the file.
     *
     * See `ProtonDriveClient.getFileRevisionUploader` for more information.
     */
    async getFileRevisionUploader(
        nodeUid: NodeOrUid,
        metadata: UploadMetadata,
        signal?: AbortSignal,
    ): Promise<FileUploader> {
        this.logger.info(`Getting file revision uploader for ${getUid(nodeUid)}`);
        return this.upload.getFileRevisionUploader(getUid(nodeUid), metadata, signal);
    }
}
