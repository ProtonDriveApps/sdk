import {
    Logger,
    ProtonDriveClientContructorParameters,
    NodeOrUid,
    MaybeNode,
    MaybeMissingNode,
    NodeResult,
    Revision,
    ShareNodeSettings,
    UnshareNodeSettings,
    ProtonInvitationOrUid,
    NonProtonInvitationOrUid,
    ProtonInvitationWithNode,
    MaybeBookmark,
    BookmarkOrUid,
    ShareResult,
    Device,
    DeviceType,
    DeviceOrUid,
    UploadMetadata,
    FileDownloader,
    Fileuploader,
    ThumbnailType,
    ThumbnailResult,
    SDKEvent,
    DeviceEventCallback,
    NodeEventCallback,
} from './interface';
import { DriveCrypto, SessionKey } from './crypto';
import { DriveAPIService } from './internal/apiService';
import { initSharesModule } from './internal/shares';
import { initNodesModule } from './internal/nodes';
import { initSharingModule } from './internal/sharing';
import { initDownloadModule } from './internal/download';
import { initUploadModule } from './internal/upload';
import { DriveEventsService } from './internal/events';
import { SDKEvents } from './internal/sdkEvents';
import { getConfig } from './config';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator, convertInternalMissingNodeIterator, convertInternalNode } from './transformers';
import { Telemetry } from './telemetry';
import { initDevicesModule } from './internal/devices';
import { makeNodeUid, splitNodeUid } from './internal/uids';

/**
 * ProtonDriveClient is the main interface for the ProtonDrive SDK.
 * 
 * The client provides high-level operations for managing nodes, sharing,
 * and downloading/uploading files. It is the main entry point for using
 * the ProtonDrive SDK.
 */
export class ProtonDriveClient {
    private logger: Logger;
    private sdkEvents: SDKEvents;
    private events: DriveEventsService;
    private shares: ReturnType<typeof initSharesModule>;
    private nodes: ReturnType<typeof initNodesModule>;
    private sharing: ReturnType<typeof initSharingModule>;
    private download: ReturnType<typeof initDownloadModule>;
    private upload: ReturnType<typeof initUploadModule>;
    private devices: ReturnType<typeof initDevicesModule>;

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
        entitiesCache,
        cryptoCache,
        account,
        openPGPCryptoModule,
        srpModule,
        config,
        telemetry,
    }: ProtonDriveClientContructorParameters) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }
        this.logger = telemetry.getLogger('interface');

        const fullConfig = getConfig(config);
        this.sdkEvents = new SDKEvents(telemetry);
        const cryptoModule = new DriveCrypto(openPGPCryptoModule, srpModule);
        const apiService = new DriveAPIService(telemetry, this.sdkEvents, httpClient, fullConfig.baseUrl, fullConfig.language);
        this.events = new DriveEventsService(telemetry, apiService, entitiesCache);
        this.shares = initSharesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initNodesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule, this.events, this.shares);
        this.sharing = initSharingModule(telemetry, apiService, entitiesCache, account, cryptoModule, this.events, this.shares, this.nodes.access, this.nodes.events);
        this.download = initDownloadModule(telemetry, apiService, cryptoModule, account, this.shares, this.nodes.access, this.nodes.revisions);
        this.upload = initUploadModule(telemetry, apiService, cryptoModule, this.shares, this.nodes.access, this.nodes.events);
        this.devices = initDevicesModule(telemetry, apiService, cryptoModule, this.shares, this.nodes.access, this.nodes.management);
        this.experimental = {
            getNodeUrl: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting node URL for ${getUid(nodeUid)}`);
                return this.nodes.access.getNodeUrl(getUid(nodeUid));
            },
            getDocsKey: async (nodeUid: NodeOrUid) => {
                this.logger.debug(`Getting docs keys for ${getUid(nodeUid)}`);
                const keys = await this.nodes.access.getNodeKeys(getUid(nodeUid));
                if (!keys.contentKeyPacketSessionKey) {
                    throw new Error('Node does not have a content key packet session key');
                }
                return keys.contentKeyPacketSessionKey;
            },
        }
    }

    /**
     * Subscribes to the general SDK events.
     * 
     * This is not connected to the remote data updates. For that, use
     * and see `subscribeToRemoteDataUpdates`.
     *
     * @param eventName - SDK event name.
     * @param callback - Callback to be called when the event is emitted.
     * @returns Callback to unsubscribe from the event.
     */
    onMessage(eventName: SDKEvent, callback: () => void): () => void {
        this.logger.debug(`Subscribing to event ${eventName}`);
        return this.sdkEvents.addListener(eventName, callback);
    }

    /**
     * Subscribes to the remote data updates.
     * 
     * By default, SDK doesn't subscribe to remote data updates. If you
     * cache the data locally, you need to call this method so the SDK
     * keeps the local cache in sync with the remote data.
     * 
     * Only one instance of the SDK should subscribe to remote data updates.
     *
     * Once subscribed, the SDK will poll for events for core user events and
     * for own data at minimum. Updates to nodes from other users are polled
     * with lower frequency depending on the number of subscriptions, and only
     * after accessing them for the first time via `iterateSharedNodesWithMe`.
     */
    async subscribeToRemoteDataUpdates(): Promise<void> {
        this.logger.debug('Subscribing to remote data updates');
        await this.events.subscribeToRemoteDataUpdates();

        const { volumeId } = await this.shares.getMyFilesIDs();
        await this.events.listenToVolume(volumeId, true);
    }

    /**
     * Subscribe to updates of the devices.
     * 
     * Clients should subscribe to this before beginning to list devices
     * to ensure that updates are reflected once a device is in the cache.
     * Subscribing before listing is also required to ensure that devices
     * that are created during the listing will be recognized.
     * 
     * ```typescript
     * const unsubscribe = sdk.subscribeToDevices((event) => {
     *     if (event.type === 'update') {
     *         // Update the device in the UI
     *     } else if (event.type === 'remove') {
     *         // Remove the device from the UI
     *     }
     * });
     *
     * const devices = await Array.fromAsync(sdk.iterateDevices());
     * // Render the devices in the UI
     * 
     * // Unsubscribe from the updates when the component is unmounted
     * unsubscribe();
     * ```
     *
     * @param callback - Callback to be called when the event is emitted.
     * @returns Callback to unsubscribe from the event.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    subscribeToDevices(callback: DeviceEventCallback): () => void {
        this.logger.debug('Subscribing to devices');
        throw new Error('Method not implemented');
    }

    /**
     * Subscribe to updates of the children of the given parent node.
     * 
     * Clients should subscribe to this before beginning to list children
     * to ensure that updates are reflected once a node is in the cache.
     * Subscribing before listing is also required to ensure that nodes 
     * that are created during the listing will be recognized.
     * 
     * ```typescript
     * const unsubscribe = sdk.subscribeToChildren(parentNodeUid, (event) => {
     *     if (event.type === 'update') {
     *         // Update the node in the UI
     *     } else if (event.type === 'remove') {
     *         // Remove the node from the UI
     *     }
     * });
     *
     * const nodes = await Array.fromAsync(sdk.iterateChildren(parentNodeUid));
     * // Render the nodes in the UI
     * 
     * // Unsubscribe from the updates when the component is unmounted
     * unsubscribe();
     * ```
     *
     * @param parentNodeUid - Node entity or its UID string.
     * @param callback - Callback to be called when the event is emitted.
     * @returns Callback to unsubscribe from the event.
     */
    subscribeToFolder(parentNodeUid: NodeOrUid, callback: NodeEventCallback): () => void {
        this.logger.debug(`Subscribing to children of ${getUid(parentNodeUid)}`);
        return this.nodes.events.subscribeToChildren(getUid(parentNodeUid), callback);
    }

    /**
     * Subscribe to updates of the trashed nodes.
     * 
     * Clients should subscribe to this before beginning to list trashed
     * nodes to ensure that updates are reflected once a node is in the cache.
     * Subscribing before listing is also required to ensure that nodes
     * that are trashed during the listing will be recognized.
     * 
     * ```typescript
     * const unsubscribe = sdk.subscribeToTrashedNodes((event) => {
     *     if (event.type === 'update') {
     *         // Update the node in the UI
     *     } else if (event.type === 'remove') {
     *         // Remove the node from the UI
     *     }
     * });
     *
     * const nodes = await Array.fromAsync(sdk.iterateTrashedNodes());
     * // Render the nodes in the UI
     * 
     * // Unsubscribe from the updates when the component is unmounted
     * unsubscribe();
     * ```
     *
     * @param callback - Callback to be called when the event is emitted.
     * @returns Callback to unsubscribe from the event.
     */
    subscribeToTrashedNodes(callback: NodeEventCallback): () => void {
        this.logger.debug('Subscribing to trashed nodes');
        return this.nodes.events.subscribeToTrashedNodes(callback);
    }

    /**
     * Subscribe to updates of the nodes shared by the user.
     * 
     * Clients should subscribe to this before beginning to list shared
     * nodes to ensure that updates are reflected once a node is in the cache.
     * Subscribing before listing is also required to ensure that nodes
     * that are shared during the listing will be recognized.
     * 
     * ```typescript
     * const unsubscribe = sdk.subscribeToSharedNodesByMe((event) => {
     *     if (event.type === 'update') {
     *         // Update the node in the UI
     *     } else if (event.type === 'remove') {
     *         // Remove the node from the UI
     *     }
     * });
     * 
     * const nodes = await Array.fromAsync(sdk.iterateSharedNodes());
     * // Render the nodes in the UI
     * 
     * // Unsubscribe from the updates when the component is unmounted
     * unsubscribe();
     * ```
     * 
     * @param callback - Callback to be called when the event is emitted.
     * @returns Callback to unsubscribe from the event.
     */
    subscribeToSharedNodesByMe(callback: NodeEventCallback): () => void {
        this.logger.debug('Subscribing to shared nodes by me');
        return this.sharing.events.subscribeToSharedNodesByMe(callback);
    }

    /**
     * Subscribe to updates of the nodes shared with the user.
     * 
     * Clients should subscribe to this before beginning to list shared
     * nodes to ensure that updates are reflected once a node is in the cache.
     * Subscribing before listing is also required to ensure that nodes
     * that are shared during the listing will be recognized.
     * 
     * ```typescript
     * const unsubscribe = sdk.subscribeToSharedNodesWithMe((event) => {
     *     if (event.type === 'update') {
     *         // Update the node in the UI
     *     } else if (event.type === 'remove') {
     *         // Remove the node from the UI
     *     }
     * });
     * 
     * const nodes = await Array.fromAsync(sdk.iterateSharedNodesWithMe());
     * // Render the nodes in the UI
     * 
     * // Unsubscribe from the updates when the component is unmounted
     * unsubscribe();
     * ```
     * 
     * @param callback - Callback to be called when the event is emitted.
     * @returns Callback to unsubscribe from the event.
     */
    subscribeToSharedNodesWithMe(callback: NodeEventCallback): () => void {
        this.logger.debug('Subscribing to shared nodes with me');
        return this.sharing.events.subscribeToSharedNodesWithMe(callback);
    }

    /**
     * Provides the node UID for the given raw share and node IDs.
     * 
     * This is required only for the internal implementation to provide
     * backward compatibility with the old Drive web setup.
     * 
     * If you are having volume ID, use `generateNodeUid` instead.
     * 
     * @deprecated This method is not part of the public API.
     * @param shareId - Context share of the node.
     * @param nodeId - Node/link ID (not UID).
     * @returns The node UID.
     */
    async getNodeUid(shareId: string, nodeId: string): Promise<string> {
        this.logger.info(`Getting node UID for share ${shareId} and node ${nodeId}`);
        const share = await this.shares.loadEncryptedShare(shareId);
        return makeNodeUid(share.volumeId, nodeId);
    }

    /**
     * @returns The root folder to My files section of the user.
     */
    async getMyFilesRootFolder(): Promise<MaybeNode> {
        this.logger.info('Getting my files root folder');
        return convertInternalNodePromise(this.nodes.access.getMyFilesRootFolder());
    }

    /**
     * Iterates the children of the given parent node.
     * 
     * The output is not sorted and the order of the children is not guaranteed.
     *
     * You can listen to updates via `subscribeToChildren`.
     *
     * @param parentNodeUid - Node entity or its UID string.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the children of the given parent node.
     */
    async* iterateFolderChildren(parentNodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<MaybeNode> {
        this.logger.info(`Iterating children of ${getUid(parentNodeUid)}`);
        yield* convertInternalNodeIterator(this.nodes.access.iterateFolderChildren(getUid(parentNodeUid), signal));
    }

    /**
     * Iterates the trashed nodes.
     * 
     * The list of trashed nodes is not cached and is fetched from the server
     * on each call. The node data itself are served from cached if available.
     * 
     * The output is not sorted and the order of the trashed nodes is not guaranteed.
     *
     * You can listen to updates via `subscribeToTrashedNodes`.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the trashed nodes.
     */
    async* iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<MaybeNode> {
        this.logger.info('Iterating trashed nodes');
        yield* convertInternalNodeIterator(this.nodes.access.iterateTrashedNodes(signal));
    }

    /**
     * Iterates the nodes by their UIDs.
     * 
     * The output is not sorted and the order of the nodes is not guaranteed.
     *
     * @param nodeUids - List of node entities or their UIDs.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the nodes.
     */
    async* iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<MaybeMissingNode> {
        this.logger.info(`Iterating ${nodeUids.length} nodes`);
        yield* convertInternalMissingNodeIterator(this.nodes.access.iterateNodes(getUids(nodeUids), signal));
    }

    /**
     * Get the node by its UID.
     *
     * @param nodeUid - Node entity or its UID string.
     * @returns The node entity.
     */
    async getNode(nodeUid: NodeOrUid): Promise<MaybeNode> {
        this.logger.info(`Getting node ${getUid(nodeUid)}`);
        return convertInternalNodePromise(this.nodes.access.getNode(getUid(nodeUid)));
    }

    /**
     * Rename the node.
     *
     * @param nodeUid - Node entity or its UID string.
     * @returns The updated node entity.
     * @throws {@link ValidationError} If the name is empty, too long, or contains a slash.
     * @throws {@link Error} If another node with the same name already exists.
     */
    async renameNode(nodeUid: NodeOrUid, newName: string): Promise<MaybeNode> {
        this.logger.info(`Renaming node ${getUid(nodeUid)}`);
        return convertInternalNodePromise(this.nodes.management.renameNode(getUid(nodeUid), newName));
    }

    /**
     * Move the nodes to a new parent node.
     * 
     * The operation is performed node by node and the results are yielded
     * as they are available. Order of the results is not guaranteed.
     * 
     * If one of the nodes fails to move, the operation continues with the
     * rest of the nodes. Use `NodeResult` to check the status of the action.
     * 
     * Only move withing the same section is supported at this moment.
     * That means that the new parent node must be in the same section
     * as the nodes being moved. E.g., moving from My files to Shared with
     * me is not supported yet.
     *
     * @param nodeUids - List of node entities or their UIDs.
     * @param newParentNodeUid - Node entity or its UID string.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the results of the move operation
     */
    async* moveNodes(nodeUids: NodeOrUid[], newParentNodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Moving ${nodeUids.length} nodes to ${newParentNodeUid}`);
        yield* this.nodes.management.moveNodes(getUids(nodeUids), getUid(newParentNodeUid), signal);
    }

    /**
     * Trash the nodes.
     * 
     * The operation is performed in batches and the results are yielded
     * as they are available. Order of the results is not guaranteed.
     * 
     * If one of the nodes fails to trash, the operation continues with the
     * rest of the nodes. Use `NodeResult` to check the status of the action.
     *
     * @param nodeUids - List of node entities or their UIDs.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the results of the trash operation
     */
    async* trashNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Trashing ${nodeUids.length} nodes`);
        yield* this.nodes.management.trashNodes(getUids(nodeUids), signal);
    }

    /**
     * Restore the nodes from the trash to their original place.
     * 
     * The operation is performed in batches and the results are yielded
     * as they are available. Order of the results is not guaranteed.
     * 
     * If one of the nodes fails to restore, the operation continues with the
     * rest of the nodes. Use `NodeResult` to check the status of the action.
     *
     * @param nodeUids - List of node entities or their UIDs.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the results of the restore operation
     */
    async* restoreNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Restoring ${nodeUids.length} nodes`);
        yield* this.nodes.management.restoreNodes(getUids(nodeUids), signal);
    }

    /**
     * Delete the nodes permanently.
     * 
     * The operation is performed in batches and the results are yielded
     * as they are available. Order of the results is not guaranteed.
     * 
     * If one of the nodes fails to delete, the operation continues with the
     * rest of the nodes. Use `NodeResult` to check the status of the action.
     *
     * @param nodeUids - List of node entities or their UIDs.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the results of the delete operation
     */
    async* deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Deleting ${nodeUids.length} nodes`);
        yield* this.nodes.management.deleteNodes(getUids(nodeUids), signal);
    }

    async emptyTrash(): Promise<void> {
        this.logger.info('Emptying trash');
        throw new Error('Method not implemented');
    }

    /**
     * Create a new folder.
     * 
     * The folder is created in the given parent node.
     *
     * @param parentNodeUid - Node entity or its UID string of the parent folder.
     * @param name - Name of the new folder.
     * @param modificationTime - Optional modification time of the folder.
     * @returns The created node entity.
     * @throws {@link Error} If the parent node is not a folder.
     * @throws {@link ValidationError} If the name is empty, too long, or contains a slash.
     * @throws {@link Error} If another node with the same name already exists.
     */
    async createFolder(parentNodeUid: NodeOrUid, name: string, modificationTime?: Date): Promise<MaybeNode> {
        this.logger.info(`Creating folder in ${getUid(parentNodeUid)}`);
        return convertInternalNodePromise(this.nodes.management.createFolder(getUid(parentNodeUid), name, modificationTime));
    }

    /**
     * Iterates the revisions of given node.
     * 
     * The list of node revisions is not cached and is fetched and decrypted
     * from the server on each call.
     * 
     * The output is sorted by the revision date in descending order (newest
     * first).
     *
     * @param nodeUid - Node entity or its UID string.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the node revisions.
     */
    async* iterateRevisions(nodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<Revision> {
        this.logger.info(`Iterating revisions of ${getUid(nodeUid)}`);
        yield* this.nodes.revisions.iterateRevisions(getUid(nodeUid), signal);
    }

    /**
     * Restore the node to the given revision.
     *
     * Warning: Restoring revisions might be accepted by the server but not
     * applied. If the client re-loads list of revisions quickly after the
     * restore, the change might not be visible. Update the UI optimistically to
     * reflect the change.
     *
     * @param revisionUid - UID of the revision to restore.
     */
    async restoreRevision(revisionUid: string): Promise<void> {
        this.logger.info(`Restoring revision ${revisionUid}`);
        await this.nodes.revisions.restoreRevision(revisionUid);
    }

    /**
     * Delete the revision.
     *
     * @param revisionUid - UID of the revision to delete.
     */
    async deleteRevision(revisionUid: string): Promise<void> {
        this.logger.info(`Deleting revision ${revisionUid}`);
        await this.nodes.revisions.deleteRevision(revisionUid);
    }

    /**
     * Iterates the nodes shared by the user.
     *
     * The output is not sorted and the order of the shared nodes is not guaranteed.
     * 
     * You can listen to updates via `subscribeToSharedNodesByMe`.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the shared nodes.
     */
    async* iterateSharedNodes(signal?: AbortSignal): AsyncGenerator<MaybeNode> {
        this.logger.info('Iterating shared nodes by me');
        yield* convertInternalNodeIterator(this.sharing.access.iterateSharedNodes(signal));
    }

    /**
     * Iterates the nodes shared with the user.
     *
     * The output is not sorted and the order of the shared nodes is not guaranteed.
     * 
     * At the end of the iteration, if `subscribeToRemoteDataUpdates` was called,
     * the SDK will listen to updates for the shared nodes to keep the local cache
     * in sync with the remote data.
     * 
     * You can listen to updates via `subscribeToSharedNodesWithMe`.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the shared nodes.
     */
    async* iterateSharedNodesWithMe(signal?: AbortSignal): AsyncGenerator<MaybeNode> {
        this.logger.info('Iterating shared nodes with me');

        const uniqueVolumeIds = new Set<string>();
        for await (const node of this.sharing.access.iterateSharedNodesWithMe(signal)) {
            yield convertInternalNode(node);
            const { volumeId } = splitNodeUid(node.uid);
            uniqueVolumeIds.add(volumeId);
        }

        for (const volumeId of uniqueVolumeIds) {
            await this.events.listenToVolume(volumeId, false);
        }
    }

    /**
     * Leave shared node that was previously shared with the user.
     *
     * @param nodeUid - Node entity or its UID string.
     */
    async leaveSharedNode(nodeUid: NodeOrUid): Promise<void> {
        this.logger.info(`Leaving shared node with me ${getUid(nodeUid)}`);
        await this.sharing.access.removeSharedNodeWithMe(getUid(nodeUid));
    }

    /**
     * Iterates the invitations to shared nodes.
     *
     * The output is not sorted and the order of the invitations is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the invitations.
     */
    async* iterateInvitations(signal?: AbortSignal): AsyncGenerator<ProtonInvitationWithNode> {
        this.logger.info('Iterating invitations');
        yield* this.sharing.access.iterateInvitations(signal);
    }

    /**
     * Accept the invitation to the shared node.
     *
     * @param invitationId - Invitation entity or its UID string.
     */
    async acceptInvitation(invitationId: string): Promise<void> {
        this.logger.info(`Accepting invitation ${invitationId}`);
        await this.sharing.access.acceptInvitation(invitationId);
    }

    /**
     * Reject the invitation to the shared node.
     *
     * @param invitationId - Invitation entity or its UID string.
     */
    async rejectInvitation(invitationId: string): Promise<void> {
        this.logger.info(`Rejecting invitation ${invitationId}`);
        await this.sharing.access.rejectInvitation(invitationId);
    }

    /**
     * Iterates the shared bookmarks.
     *
     * The output is not sorted and the order of the bookmarks is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the shared bookmarks.
     */
    async* iterateBookmarks(signal?: AbortSignal): AsyncGenerator<MaybeBookmark> {
        this.logger.info('Iterating shared bookmarks');
        yield* this.sharing.access.iterateBookmarks(signal);
    }

    /**
     * Remove the shared bookmark.
     *
     * @param bookmarkOrUid - Bookmark entity or its UID string.
     */
    async removeBookmark(bookmarkOrUid: BookmarkOrUid): Promise<void> {
        this.logger.info(`Removing bookmark ${getUid(bookmarkOrUid)}`);
        await this.sharing.access.deleteBookmark(getUid(bookmarkOrUid));
    }

    /**
     * Get sharing info of the node.
     * 
     * The sharing info contains the list of invitations, members,
     * public link and permission for each.
     *
     * The sharing info is not cached and is fetched from the server
     * on each call.
     *
     * @param nodeUid - Node entity or its UID string.
     * @returns The sharing info of the node. Undefined if not shared.
     */
    async getSharingInfo(nodeUid: NodeOrUid): Promise<ShareResult | undefined> {
        this.logger.info(`Getting sharing info for ${getUid(nodeUid)}`);
        return this.sharing.management.getSharingInfo(getUid(nodeUid));
    }

    /**
     * Share or update sharing of the node.
     * 
     * If the node is already shared, the sharing settings are updated.
     * If the member is already present but with different role, the role
     * is updated. If the sharing settings is identical, the sharing info
     * is returned without any change.
     *
     * @param nodeUid - Node entity or its UID string.
     * @param settings - Settings for sharing the node.
     * @returns The updated sharing info of the node.
     */
    async shareNode(nodeUid: NodeOrUid, settings: ShareNodeSettings): Promise<ShareResult> {
        this.logger.info(`Sharing node ${getUid(nodeUid)}`);
        return this.sharing.management.shareNode(getUid(nodeUid), settings);
    }

    /**
     * Unshare the node, completely or partially.
     *
     * @param nodeUid - Node entity or its UID string.
     * @param settings - Settings for unsharing the node. If not provided, the node
     *                   is unshared completely.
     * @returns The updated sharing info of the node. Undefined if unshared completely.
     */
    async unshareNode(nodeUid: NodeOrUid, settings?: UnshareNodeSettings): Promise<ShareResult | undefined> {
        if (!settings) {
            this.logger.info(`Unsharing node ${getUid(nodeUid)}`);
        } else {
            this.logger.info(`Partially unsharing ${getUid(nodeUid)}`);
        }
        return this.sharing.management.unshareNode(getUid(nodeUid), settings);
    }

    async resendInvitation(nodeUid: NodeOrUid, invitationUid: ProtonInvitationOrUid | NonProtonInvitationOrUid): Promise<void> {
        this.logger.info(`Resending invitation ${getUid(invitationUid)}`);
        return this.sharing.management.resendInvitationEmail(getUid(nodeUid), getUid(invitationUid))
    }

    /**
     * Get the file downloader to download the node content of the active
     * revision. For downloading specific revision of the file, use
     * `getFileRevisionDownloader`.
     * 
     * The number of ongoing downloads is limited. If the limit is reached,
     * the download is queued and started when the slot is available. It is
     * recommended to not start too many downloads at once to avoid having
     * many open promises.
     * 
     * The file downloader is not reusable. If the download is interrupted,
     * a new file downloader must be created.
     * 
     * Before download, the authorship of the node should be checked and
     * reported to the user if there is any signature issue, notably on the
     * content author on the revision.
     * 
     * Client should not automatically retry the download if it fails. The
     * download should be initiated by the user again. The downloader does
     * automatically retry the download if it fails due to network issues,
     * or if the server is temporarily unavailable. 
     * 
     * Once download is initiated, the download can fail, besides network
     * issues etc., only when there is integrity error. It should be considered
     * a bug and reported to the Drive developers. The SDK provides option
     * to bypass integrity checks, but that should be used only for debugging
     * purposes, not available to the end users.
     * 
     * Example usage:
     * 
     * ```typescript
     * const downloader = await client.getFileDownloader(nodeUid, signal);
     * const claimedSize = fileDownloader.getClaimedSizeInBytes();
     * const downloadController = fileDownloader.writeToStream(stream, (downloadedBytes) => { ... });
     * 
     * signalController.abort(); // to cancel
     * downloadController.pause(); // to pause
     * downloadController.resume(); // to resume
     * await downloadController.completion(); // to await completion
     * ```
     */
    async getFileDownloader(nodeUid: NodeOrUid, signal?: AbortSignal): Promise<FileDownloader> {
        this.logger.info(`Getting file downloader for ${getUid(nodeUid)}`);
        return this.download.getFileDownloader(getUid(nodeUid), signal);
    }

    /**
     * Same as `getFileDownloader`, but for a specific revision of the file.
     */
    async getFileRevisionDownloader(nodeRevisionUid: string, signal?: AbortSignal): Promise<FileDownloader> {
        this.logger.info(`Getting file revision downloader for ${getUid(nodeRevisionUid)}`);
        return this.download.getFileRevisionDownloader(nodeRevisionUid, signal);
    }

    /**
    * Iterates the thumbnails of the given nodes.
    *
    * The output is not sorted and the order of the nodes is not guaranteed.
    *
    * @param nodeUids - List of node entities or their UIDs.
    * @param thumbnailType - Type of the thumbnail to download.
    * @returns An async generator of the results of the restore operation
    */
    async *iterateThumbnails(nodeUids: NodeOrUid[], thumbnailType?: ThumbnailType, signal?: AbortSignal): AsyncGenerator<ThumbnailResult> {
        this.logger.info(`Iterating ${nodeUids.length} thumbnails`);
        yield* this.download.iterateThumbnails(getUids(nodeUids), thumbnailType, signal);
    }

    /**
     * Get the file uploader to upload a new file. For uploading a new
     * revision, use `getFileRevisionUploader` instead.
     * 
     * The number of ongoing uploads is limited. If the limit is reached,
     * the upload is queued and started when the slot is available. It is
     * recommended to not start too many uploads at once to avoid having
     * many open promises.
     * 
     * The file uploader is not reusable. If the upload is interrupted,
     * a new file uploader must be created.
     * 
     * Client should not automatically retry the upload if it fails. The
     * upload should be initiated by the user again. The uploader does
     * automatically retry the upload if it fails due to network issues,
     * or if the server is temporarily unavailable.
     * 
     * Example usage:
     * 
     * ```typescript
     * const uploader = await client.getFileUploader(parentFolderUid, name, metadata, signal);
     * const uploadController = uploader.writeStream(stream, thumbnails, (uploadedBytes) => { ... });
     * 
     * signalController.abort(); // to cancel
     * uploadController.pause(); // to pause
     * uploadController.resume(); // to resume
     * const nodeUid = await uploadController.completion(); // to await completion
     * ```
     */
    async getFileUploader(parentFolderUid: NodeOrUid, name: string, metadata: UploadMetadata, signal?: AbortSignal): Promise<Fileuploader> {
        this.logger.info(`Getting file uploader for parent ${getUid(parentFolderUid)}`);
        return this.upload.getFileUploader(getUid(parentFolderUid), name, metadata, signal);
    }

    /**
     * Same as `getFileUploader`, but for a uploading new revision of the file.
     */
    async getFileRevisionUploader(nodeUid: NodeOrUid, metadata: UploadMetadata, signal?: AbortSignal): Promise<Fileuploader> {
        this.logger.info(`Getting file revision uploader for ${getUid(nodeUid)}`);
        return this.upload.getFileRevisionUploader(getUid(nodeUid), metadata, signal);
    }

    /**
     * Iterates the devices of the user.
     * 
     * The output is not sorted and the order of the devices is not guaranteed.
     *
     * You can listen to updates via `subscribeToDevices`.
     *
     * @returns An async generator of devices.
     */
    async* iterateDevices(signal?: AbortSignal): AsyncGenerator<Device> {
        this.logger.info('Iterating devices');
        yield* this.devices.iterateDevices(signal);
    }

    /**
     * Creates a new device.
     * 
     * @param nodeUid - Device entity or its UID string.
     * @returns The created device entity.
     * @throws {@link ValidationError} If the name is empty, too long, or contains a slash.
     */
    async createDevice(name: string, deviceType: DeviceType): Promise<Device> {
        this.logger.info(`Creating device of type ${deviceType}`);
        return this.devices.createDevice(name, deviceType);
    }

    /**
     * Renames a device.
     * 
     * @param deviceOrUid - Device entity or its UID string.
     * @returns The updated device entity.
     * @throws {@link ValidationError} If the name is empty, too long, or contains a slash.
     */
    async renameDevice(deviceOrUid: DeviceOrUid, name: string): Promise<Device> {
        this.logger.info(`Renaming device ${getUid(deviceOrUid)}`);
        return this.devices.renameDevice(getUid(deviceOrUid), name);
    }

    /**
     * Deletes a device.
     * 
     * @param deviceOrUid - Device entity or its UID string.
     */
    async deleteDevice(deviceOrUid: DeviceOrUid): Promise<void> {
        this.logger.info(`Deleting device ${getUid(deviceOrUid)}`);
        await this.devices.deleteDevice(getUid(deviceOrUid));
    }
}
