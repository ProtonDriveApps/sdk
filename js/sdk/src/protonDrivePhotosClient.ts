import {
    Logger,
    ProtonDriveClientContructorParameters,
    NodeOrUid,
    MaybeMissingNode,
    UploadMetadata,
    FileDownloader,
    FileUploader,
    SDKEvent,
    MaybeNode,
    ThumbnailType,
    ThumbnailResult,
} from './interface';
import { getConfig } from './config';
import { DriveCrypto } from './crypto';
import { Telemetry } from './telemetry';
import {
    convertInternalMissingNodeIterator,
    convertInternalNodeIterator,
    convertInternalNodePromise,
    getUid,
    getUids,
} from './transformers';
import { DriveAPIService } from './internal/apiService';
import { initDownloadModule } from './internal/download';
import { DriveEventsService, DriveListener, EventSubscription } from './internal/events';
import { initNodesModule } from './internal/nodes';
import { initPhotosModule, initPhotoSharesModule, initPhotoUploadModule } from './internal/photos';
import { SDKEvents } from './internal/sdkEvents';
import { initSharesModule } from './internal/shares';
import { initSharingModule } from './internal/sharing';

/**
 * ProtonDrivePhotosClient is the interface to access Photos functionality.
 *
 * The client provides high-level operations for managing photos, albums, sharing,
 * and downloading/uploading photos.
 *
 * @deprecated This is an experimental feature that might change without a warning.
 */
export class ProtonDrivePhotosClient {
    private logger: Logger;
    private sdkEvents: SDKEvents;
    private events: DriveEventsService;
    private photoShares: ReturnType<typeof initPhotoSharesModule>;
    private nodes: ReturnType<typeof initNodesModule>;
    private sharing: ReturnType<typeof initSharingModule>;
    private download: ReturnType<typeof initDownloadModule>;
    private upload: ReturnType<typeof initPhotoUploadModule>;
    private photos: ReturnType<typeof initPhotosModule>;

    public experimental: {
        /**
         * Experimental feature to return the URL of the node.
         *
         * See `ProtonDriveClient.experimental.getNodeUrl` for more information.
         */
        getNodeUrl: (nodeUid: NodeOrUid) => Promise<string>;
    };

    constructor({
        httpClient,
        entitiesCache,
        cryptoCache,
        account,
        openPGPCryptoModule,
        srpModule,
        config,
        telemetry,
        latestEventIdProvider,
    }: ProtonDriveClientContructorParameters) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }
        this.logger = telemetry.getLogger('interface');

        const fullConfig = getConfig(config);
        this.sdkEvents = new SDKEvents(telemetry);
        const cryptoModule = new DriveCrypto(openPGPCryptoModule, srpModule);
        const apiService = new DriveAPIService(
            telemetry,
            this.sdkEvents,
            httpClient,
            fullConfig.baseUrl,
            fullConfig.language,
        );
        const coreShares = initSharesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.photoShares = initPhotoSharesModule(
            telemetry,
            apiService,
            entitiesCache,
            cryptoCache,
            account,
            cryptoModule,
            coreShares,
        );
        this.nodes = initNodesModule(
            telemetry,
            apiService,
            entitiesCache,
            cryptoCache,
            account,
            cryptoModule,
            this.photoShares,
        );
        this.photos = initPhotosModule(apiService, this.photoShares, this.nodes.access);
        this.sharing = initSharingModule(
            telemetry,
            apiService,
            entitiesCache,
            account,
            cryptoModule,
            this.photoShares,
            this.nodes.access,
        );
        this.download = initDownloadModule(
            telemetry,
            apiService,
            cryptoModule,
            account,
            this.photoShares,
            this.nodes.access,
            this.nodes.revisions,
        );
        this.upload = initPhotoUploadModule(
            telemetry,
            apiService,
            cryptoModule,
            this.photoShares,
            this.nodes.access,
            fullConfig.clientUid,
        );

        // These are used to keep the internal cache up to date
        const cacheEventListeners: DriveListener[] = [
            this.nodes.eventHandler.updateNodesCacheOnEvent.bind(this.nodes.eventHandler),
            this.sharing.eventHandler.handleDriveEvent.bind(this.sharing.eventHandler),
        ];
        this.events = new DriveEventsService(
            telemetry,
            apiService,
            this.photoShares,
            cacheEventListeners,
            latestEventIdProvider,
        );

        this.experimental = {
            getNodeUrl: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting node URL for ${getUid(nodeUid)}`);
                return this.nodes.access.getNodeUrl(getUid(nodeUid));
            },
        };
    }

    /**
     * Subscribes to the general SDK events.
     *
     * See `ProtonDriveClient.onMessage` for more information.
     */
    onMessage(eventName: SDKEvent, callback: () => void): () => void {
        this.logger.debug(`Subscribing to event ${eventName}`);
        return this.sdkEvents.addListener(eventName, callback);
    }

    /**
     * Subscribes to the remote data updates for all files in a tree.
     *
     * See `ProtonDriveClient.subscribeToTreeEvents` for more information.
     */
    async subscribeToTreeEvents(treeEventScopeId: string, callback: DriveListener): Promise<EventSubscription> {
        this.logger.debug('Subscribing to node updates');
        return this.events.subscribeToTreeEvents(treeEventScopeId, callback);
    }

    /**
     * Subscribes to the remote general data updates.
     *
     * See `ProtonDriveClient.subscribeToDriveEvents` for more information.
     */
    async subscribeToDriveEvents(callback: DriveListener): Promise<EventSubscription> {
        this.logger.debug('Subscribing to core updates');
        return this.events.subscribeToCoreEvents(callback);
    }

    /**
     * Iterates all the photos for the timeline view.
     *
     * The output includes only necessary information to quickly prepare
     * the whole timeline view with the break-down per month/year and fast
     * scrollbar.
     *
     * Individual photos details must be loaded separately based on what
     * is visible in the UI.
     *
     * The output is sorted by the capture time, starting from the
     * the most recent photos.
     */
    async *iterateTimeline(signal?: AbortSignal): AsyncGenerator<{
        nodeUid: string;
        captureTime: Date;
        tags: number[];
    }> {
        // TODO: expose better type
        yield* this.photos.timeline.iterateTimeline(signal);
    }

    /**
     * Iterates the nodes by their UIDs.
     *
     * See `ProtonDriveClient.iterateNodes` for more information.
     */
    async *iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<MaybeMissingNode> {
        this.logger.info(`Iterating ${nodeUids.length} nodes`);
        // TODO: expose photo type
        yield* convertInternalMissingNodeIterator(this.nodes.access.iterateNodes(getUids(nodeUids), signal));
    }

    /**
     * Get the node by its UID.
     *
     * See `ProtonDriveClient.getNode` for more information.
     */
    async getNode(nodeUid: NodeOrUid): Promise<MaybeNode> {
        this.logger.info(`Getting node ${getUid(nodeUid)}`);
        return convertInternalNodePromise(this.nodes.access.getNode(getUid(nodeUid)));
    }

    /**
     * Iterates the albums.
     *
     * The output is not sorted and the order of the nodes is not guaranteed.
     */
    async *iterateAlbums(signal?: AbortSignal): AsyncGenerator<MaybeNode> {
        this.logger.info('Iterating albums');
        // TODO: expose album type
        yield* convertInternalNodeIterator(this.photos.albums.iterateAlbums(signal));
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
     * Get the file uploader to upload a new file.
     *
     * See `ProtonDriveClient.getFileUploader` for more information.
     */
    async getFileUploader(
        name: string,
        metadata: UploadMetadata & {
            captureTime?: Date;
            mainPhotoLinkID?: string;
            // TODO: handle tags enum in the SDK
            tags?: (0 | 3 | 1 | 2 | 7 | 4 | 5 | 6 | 8 | 9)[];
        },
        signal?: AbortSignal,
    ): Promise<FileUploader> {
        this.logger.info(`Getting file uploader`);
        const parentFolderUid = await this.nodes.access.getVolumeRootFolder();
        return this.upload.getFileUploader(getUid(parentFolderUid), name, metadata, signal);
    }
}
