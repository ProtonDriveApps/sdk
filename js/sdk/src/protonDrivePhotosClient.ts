import {
    Logger,
    ProtonDriveClientContructorParameters,
    NodeOrUid,
    MaybeMissingPhotoNode,
    UploadMetadata,
    FileDownloader,
    FileUploader,
    SDKEvent,
    MaybePhotoNode,
    ThumbnailType,
    ThumbnailResult,
    ShareNodeSettings,
    ShareResult,
    UnshareNodeSettings,
    ProtonInvitationOrUid,
    NonProtonInvitationOrUid,
    ProtonInvitationWithNode,
    NodeResult,
    NodeResultWithError,
} from './interface';
import { getConfig } from './config';
import { DriveCrypto } from './crypto';
import { Telemetry } from './telemetry';
import {
    convertInternalMissingPhotoNodeIterator,
    convertInternalPhotoNode,
    convertInternalPhotoNodeIterator,
    convertInternalPhotoNodePromise,
    getUid,
    getUids,
} from './transformers';
import { DriveAPIService } from './internal/apiService';
import { initDownloadModule } from './internal/download';
import { DriveEventsService, DriveListener, EventSubscription } from './internal/events';
import {
    PHOTOS_SHARE_TARGET_TYPES,
    initPhotosModule,
    initPhotoSharesModule,
    initPhotoUploadModule,
    initPhotosNodesModule,
    AlbumItem,
    TimelineItem,
    PhotoTag,
} from './internal/photos';
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
    private nodes: ReturnType<typeof initPhotosNodesModule>;
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
        this.logger = telemetry.getLogger('photos-interface');

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
        this.nodes = initPhotosNodesModule(
            telemetry,
            apiService,
            entitiesCache,
            cryptoCache,
            account,
            cryptoModule,
            this.photoShares,
            fullConfig.clientUid,
        );
        this.photos = initPhotosModule(telemetry, apiService, cryptoModule, this.photoShares, this.nodes.access);
        this.sharing = initSharingModule(
            telemetry,
            apiService,
            entitiesCache,
            account,
            cryptoModule,
            this.photoShares,
            this.nodes.access,
            PHOTOS_SHARE_TARGET_TYPES,
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
     * @returns The root folder to Photos section of the user.
     */
    async getMyPhotosRootFolder(): Promise<MaybePhotoNode> {
        this.logger.info('Getting my photos root folder');
        return convertInternalPhotoNodePromise(this.nodes.access.getVolumeRootFolder());
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
    async *iterateTimeline(signal?: AbortSignal): AsyncGenerator<TimelineItem> {
        yield* this.photos.timeline.iterateTimeline(signal);
    }

    /**
     * Iterates the trashed nodes.
     *
     * See `ProtonDriveClient.iterateTrashedNodes` for more information.
     */
    async *iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<MaybePhotoNode> {
        this.logger.info('Iterating trashed nodes');
        yield* convertInternalPhotoNodeIterator(this.nodes.access.iterateTrashedNodes(signal));
    }

    /**
     * Iterates the nodes by their UIDs.
     *
     * See `ProtonDriveClient.iterateNodes` for more information.
     */
    async *iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<MaybeMissingPhotoNode> {
        this.logger.info(`Iterating ${nodeUids.length} nodes`);
        // TODO: expose photo type
        yield* convertInternalMissingPhotoNodeIterator(this.nodes.access.iterateNodes(getUids(nodeUids), signal));
    }

    /**
     * Get the node by its UID.
     *
     * See `ProtonDriveClient.getNode` for more information.
     */
    async getNode(nodeUid: NodeOrUid): Promise<MaybePhotoNode> {
        this.logger.info(`Getting node ${getUid(nodeUid)}`);
        return convertInternalPhotoNodePromise(this.nodes.access.getNode(getUid(nodeUid)));
    }

    /**
     * Rename the node.
     *
     * See `ProtonDriveClient.renameNode` for more information.
     */
    async renameNode(nodeUid: NodeOrUid, newName: string): Promise<MaybePhotoNode> {
        this.logger.info(`Renaming node ${getUid(nodeUid)}`);
        return convertInternalPhotoNodePromise(this.nodes.management.renameNode(getUid(nodeUid), newName));
    }

    /**
     * Trash the nodes.
     *
     * See `ProtonDriveClient.trashNodes` for more information.
     */
    async *trashNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Trashing ${nodeUids.length} nodes`);
        yield* this.nodes.management.trashNodes(getUids(nodeUids), signal);
    }

    /**
     * Restore the nodes from the trash to their original place.
     *
     * See `ProtonDriveClient.restoreNodes` for more information.
     */
    async *restoreNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Restoring ${nodeUids.length} nodes`);
        yield* this.nodes.management.restoreNodes(getUids(nodeUids), signal);
    }

    /**
     * Delete the nodes permanently.
     *
     * See `ProtonDriveClient.deleteNodes` for more information.
     */
    async *deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Deleting ${nodeUids.length} nodes`);
        yield* this.nodes.management.deleteTrashedNodes(getUids(nodeUids), signal);
    }

    /**
     * Empty the trash for the photos volume.
     */
    async emptyTrash(): Promise<void> {
        this.logger.info('Emptying photo volume trash');
        return this.nodes.management.emptyTrash();
    }

    /**
     * Iterates the nodes shared by the user.
     *
     * See `ProtonDriveClient.iterateSharedNodes` for more information.
     */
    async *iterateSharedNodes(signal?: AbortSignal): AsyncGenerator<MaybePhotoNode> {
        this.logger.info('Iterating shared nodes by me');
        yield* convertInternalPhotoNodeIterator(this.sharing.access.iterateSharedNodes(signal));
    }

    /**
     * Iterates the nodes shared with the user.
     *
     * See `ProtonDriveClient.iterateSharedNodesWithMe` for more information.
     */
    async *iterateSharedNodesWithMe(signal?: AbortSignal): AsyncGenerator<MaybePhotoNode> {
        this.logger.info('Iterating shared nodes with me');

        for await (const node of this.sharing.access.iterateSharedNodesWithMe(signal)) {
            yield convertInternalPhotoNode(node);
        }
    }

    /**
     * Leave shared node that was previously shared with the user.
     *
     * See `ProtonDriveClient.leaveSharedNode` for more information.
     */
    async leaveSharedNode(nodeUid: NodeOrUid): Promise<void> {
        this.logger.info(`Leaving shared node with me ${getUid(nodeUid)}`);
        await this.sharing.access.removeSharedNodeWithMe(getUid(nodeUid));
    }

    /**
     * Iterates the invitations to shared nodes.
     *
     * See `ProtonDriveClient.iterateInvitations` for more information.
     */
    async *iterateInvitations(signal?: AbortSignal): AsyncGenerator<ProtonInvitationWithNode> {
        this.logger.info('Iterating invitations');
        yield* this.sharing.access.iterateInvitations(signal);
    }

    /**
     * Accept the invitation to the shared node.
     *
     * See `ProtonDriveClient.acceptInvitation` for more information.
     */
    async acceptInvitation(invitationUid: ProtonInvitationOrUid): Promise<void> {
        this.logger.info(`Accepting invitation ${getUid(invitationUid)}`);
        await this.sharing.access.acceptInvitation(getUid(invitationUid));
    }

    /**
     * Reject the invitation to the shared node.
     *
     * See `ProtonDriveClient.rejectInvitation` for more information.
     */
    async rejectInvitation(invitationUid: ProtonInvitationOrUid): Promise<void> {
        this.logger.info(`Rejecting invitation ${getUid(invitationUid)}`);
        await this.sharing.access.rejectInvitation(getUid(invitationUid));
    }

    /**
     * Get sharing info of the node.
     *
     * See `ProtonDriveClient.getSharingInfo` for more information.
     */
    async getSharingInfo(nodeUid: NodeOrUid): Promise<ShareResult | undefined> {
        this.logger.info(`Getting sharing info for ${getUid(nodeUid)}`);
        return this.sharing.management.getSharingInfo(getUid(nodeUid));
    }

    /**
     * Share or update sharing of the node.
     *
     * See `ProtonDriveClient.shareNode` for more information.
     */
    async shareNode(nodeUid: NodeOrUid, settings: ShareNodeSettings): Promise<ShareResult> {
        this.logger.info(`Sharing node ${getUid(nodeUid)}`);
        return this.sharing.management.shareNode(getUid(nodeUid), settings);
    }

    /**
     * Unshare the node, completely or partially.
     *
     * See `ProtonDriveClient.unshareNode` for more information.
     */
    async unshareNode(nodeUid: NodeOrUid, settings?: UnshareNodeSettings): Promise<ShareResult | undefined> {
        if (!settings) {
            this.logger.info(`Unsharing node ${getUid(nodeUid)}`);
        } else {
            this.logger.info(`Partially unsharing ${getUid(nodeUid)}`);
        }
        return this.sharing.management.unshareNode(getUid(nodeUid), settings);
    }

    /**
     * Resend the invitation email to shared node.
     *
     * See `ProtonDriveClient.resendInvitation` for more information.
     */
    async resendInvitation(
        nodeUid: NodeOrUid,
        invitationUid: ProtonInvitationOrUid | NonProtonInvitationOrUid,
    ): Promise<void> {
        this.logger.info(`Resending invitation ${getUid(invitationUid)}`);
        return this.sharing.management.resendInvitationEmail(getUid(nodeUid), getUid(invitationUid));
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
            tags?: PhotoTag[];
        },
        signal?: AbortSignal,
    ): Promise<FileUploader> {
        this.logger.info(`Getting file uploader`);
        const parentFolderUid = await this.nodes.access.getVolumeRootFolder();
        return this.upload.getFileUploader(getUid(parentFolderUid), name, metadata, signal);
    }

    /**
     * Check if the photo is a duplicate.
     *
     * For given photo name, find existing photos with the same name
     * in the timeline and check if the photo content is also the same.
     * Only the same name is not considered as duplicate photo because
     * it is expected that there are photos with the same name (e.g.,
     * date as a name from multiple cameras, or rolling number).
     *
     * The function accepts a callback to generate the SHA1 and it is
     * called only when there is any matching node name hash to avoid
     * computation for every node if its not necessary.
     *
     * @param name - The name of the photo to check for duplicates.
     * @param generateSha1 - A callback to generate the hex string representation of the SHA1 of the photo content.
     * @param signal - An optional abort signal to cancel the operation.
     * @returns True if the photo already exists in the timeline, false otherwise.
     * @deprecated Use `findPhotoDuplicates` instead to get the node UIDs of duplicate photos.
     */
    async isDuplicatePhoto(name: string, generateSha1: () => Promise<string>, signal?: AbortSignal): Promise<boolean> {
        this.logger.info(`Checking if photo is a duplicate`);
        return this.photos.timeline
            .findPhotoDuplicates(name, generateSha1, signal)
            .then((nodeUids) => nodeUids.length !== 0);
    }

    /**
     * Find duplicate photos by name and content.
     *
     * For given photo name, find existing photos with the same name
     * in the timeline and check if the photo content is also the same.
     * Only the same name is not considered as duplicate photo because
     * it is expected that there are photos with the same name (e.g.,
     * date as a name from multiple cameras, or rolling number).
     *
     * The function accepts a callback to generate the SHA1 and it is
     * called only when there is any matching node name hash to avoid
     * computation for every node if its not necessary.
     *
     * @param name - The name of the photo to check for duplicates.
     * @param generateSha1 - A callback to generate the hex string representation of the SHA1 of the photo content.
     * @param signal - An optional abort signal to cancel the operation.
     * @returns An array of node UIDs of duplicate photos. Empty array if no duplicates found.
     */
    async findPhotoDuplicates(
        name: string,
        generateSha1: () => Promise<string>,
        signal?: AbortSignal,
    ): Promise<string[]> {
        this.logger.info(`Checking if photo have duplicates`);
        return this.photos.timeline.findPhotoDuplicates(name, generateSha1, signal);
    }

    /**
     * Creates a new album with the given name.
     *
     * @param name - The name for the new album.
     * @returns The created album node.
     */
    async createAlbum(name: string): Promise<MaybePhotoNode> {
        this.logger.info('Creating album');
        return convertInternalPhotoNodePromise(this.photos.albums.createAlbum(name));
    }

    /**
     * Updates an existing album.
     *
     * Updates can include a new name and/or a cover photo.
     *
     * @param nodeUid - The UID of the album to edit.
     * @param updates - The updates to apply.
     * @returns The updated album node.
     */
    async updateAlbum(
        nodeUid: NodeOrUid,
        updates: {
            name?: string;
            coverPhotoNodeUid?: NodeOrUid;
        },
    ): Promise<MaybePhotoNode> {
        this.logger.info(`Updating album ${getUid(nodeUid)}`);
        const coverPhotoNodeUid = updates.coverPhotoNodeUid ? getUid(updates.coverPhotoNodeUid) : undefined;
        return convertInternalPhotoNodePromise(
            this.photos.albums.updateAlbum(getUid(nodeUid), {
                name: updates.name,
                coverPhotoNodeUid,
            }),
        );
    }

    /**
     * Deletes an album.
     *
     * Photos in the timeline will not be deleted. If the album has photos
     * that are not in the timeline (uploaded by another user), the method
     * will throw an error. The photos must be moved to the timeline, or
     * the album must be deleted with `force` option that deletes the photos
     * not in the timeline as well.
     *
     * This operation is irreversible. Both the album and the photos will be
     * permanently deleted, skipping the trash.
     *
     * @param nodeUid - The UID of the album to delete.
     * @param force - Whether to force the deletion.
     */
    async deleteAlbum(nodeUid: NodeOrUid, options: { force?: boolean } = {}): Promise<void> {
        this.logger.info(`Deleting album ${getUid(nodeUid)}`);
        await this.photos.albums.deleteAlbum(getUid(nodeUid), options);
    }

    /**
     * Iterates the albums.
     *
     * The output is not sorted and the order of the nodes is not guaranteed.
     */
    async *iterateAlbums(signal?: AbortSignal): AsyncGenerator<MaybePhotoNode> {
        this.logger.info('Iterating albums');
        // TODO: expose album type
        yield* convertInternalPhotoNodeIterator(this.photos.albums.iterateAlbums(signal));
    }

    /**
     * Iterates the photo placeholders of the given album.
     *
     * The output is sorted by the capture time, starting from the
     * the most recent photos.
     *
     * @param albumNodeUid - The UID of the album.
     * @param signal - An optional abort the operation.
     */
    async *iterateAlbum(albumNodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<AlbumItem> {
        this.logger.info(`Iterating photos of album ${getUid(albumNodeUid)}`);
        yield* this.photos.albums.iterateAlbum(getUid(albumNodeUid), signal);
    }

    /**
     * Adds photos to an album.
     *
     * Photos are added in batches. Each photo's related photos (e.g., live
     * photo components) are always included with the main photo.
     *
     * The album has a limit of 10,000 photos. If the limit is reached,
     * a `ValidationError` is thrown.
     *
     * @param albumNodeUid - The UID of the album to add photos to.
     * @param photoNodeUids - The UIDs of the photos to add to the album.
     * @param signal - An optional abort signal to cancel the operation.
     * @returns An async generator of the added photo results.
     */
    async *addPhotosToAlbum(
        albumNodeUid: NodeOrUid,
        photoNodeUids: NodeOrUid[],
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResultWithError> {
        this.logger.info(`Adding ${photoNodeUids.length} photos to album ${getUid(albumNodeUid)}`);
        yield* this.photos.albums.addPhotos(getUid(albumNodeUid), getUids(photoNodeUids), signal);
    }

    /**
     * Removes photos from an album.
     *
     * Photos are not deleted, they are just removed from the album.
     * If a photo was added to the timeline by the user, it will remain
     * in the timeline after being removed from the album.
     *
     * @param albumNodeUid - The UID of the album to remove photos from.
     * @param photoNodeUids - The UIDs of the photos to remove from the album.
     * @param signal - An optional abort signal to cancel the operation.
     * @returns An async generator of the removed photo results.
     */
    async *removePhotosFromAlbum(
        albumNodeUid: NodeOrUid,
        photoNodeUids: NodeOrUid[],
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResultWithError> {
        this.logger.info(`Removing ${photoNodeUids.length} photos from album ${getUid(albumNodeUid)}`);
        yield* this.photos.albums.removePhotos(getUid(albumNodeUid), getUids(photoNodeUids), signal);
    }
}
