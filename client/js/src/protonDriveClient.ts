import { getConfig } from './config';
import { DriveCrypto, SessionKey } from './crypto';
import { NullFeatureFlagProvider } from './featureFlags';
import {
    BookmarkOrUid,
    Device,
    DeviceOrUid,
    DeviceType,
    DriveEvent,
    FileDownloader,
    FileUploader,
    Logger,
    MaybeBookmark,
    MaybeMissingNode,
    MemberRole,
    NodeEntity,
    NodeOrUid,
    NodeResult,
    NodeResultWithNewUid,
    NodeType,
    NonProtonInvitationOrUid,
    ProtonDriveClientContructorParameters,
    ProtonInvitation,
    ProtonInvitationOrUid,
    ProtonInvitationWithNode,
    ReportDirectShareAbuseSettings,
    Revision,
    RevisionOrUid,
    SDKEvent,
    ShareNodeSettings,
    ShareResult,
    ThumbnailResult,
    ThumbnailType,
    UnshareNodeSettings,
    UploadMetadata,
} from './interface';
import { DriveAPIService } from './internal/apiService';
import { initDevicesModule } from './internal/devices';
import { initDownloadModule } from './internal/download';
import {
    CoreApiEvent,
    DriveEventsService,
    DriveListener,
    EventScheduler,
    EventSubscription,
    InternalDriveEvent,
} from './internal/events';
import { initNodesModule } from './internal/nodes';
import { SDKEvents } from './internal/sdkEvents';
import { initSharesModule } from './internal/shares';
import { initSharingModule } from './internal/sharing';
import { getTokenAndPasswordFromUrl, SharingPublicSessionManager } from './internal/sharingPublic';
import { makeNodeUid } from './internal/uids';
import { initUploadModule } from './internal/upload';
import { ProtonDrivePublicLinkClient } from './protonDrivePublicLinkClient';
import { Telemetry } from './telemetry';
import {
    convertInternalMissingNodeIterator,
    convertInternalNode,
    convertInternalNodeIterator,
    convertInternalNodePromise,
    convertInternalRevisionIterator,
    getUid,
    getUids,
} from './transformers';

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
    private publicSessionManager: SharingPublicSessionManager;

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
        /**
         * Experimental feature to get the info for a public link
         * required to authenticate the public link.
         */
        getPublicLinkInfo: (url: string) => Promise<{
            isCustomPasswordProtected: boolean;
            isLegacy: boolean;
            vendorType: number;
            directAccess?: {
                nodeUid: string;
                directRole: MemberRole;
                publicRole: MemberRole;
            };
        }>;
        /**
         * Experimental feature to authenticate a public link and
         * return the client for the public link to access it.
         */
        authPublicLink: (
            url: string,
            customPassword?: string,
            isAnonymousContext?: boolean,
        ) => Promise<ProtonDrivePublicLinkClient>;
        /**
         * Feed a raw core API event response into the SDK.
         *
         * The SDK will derive drive-relevant events (e.g. `SharedWithMeUpdated`)
         * from it, update internal caches, and return the derived events.
         *
         * The `rawEvent` shape matches the response of the
         * `core/v5/events/{id}` endpoint.
         */
        processCoreEvent: (rawEvent: CoreApiEvent) => Promise<DriveEvent[]>;
        /**
         * Experimental feature to prepare the cryptographic material for an
         * orphaned import folder used by the Easy Switch importer.
         *
         * The returned object contains all the encrypted fields needed to pass
         * as the `drive.importFolder` payload when calling the importer start
         * endpoint. No folder is created on the server — the caller is
         * responsible for passing this data to the importer API.
         *
         * `base64Passphrase` is the cleartext node passphrase, base64-encoded.
         * Base64-decode it to recover the passphrase string that locks the node
         * key (that string is itself base64-of-random-bytes, but it is used
         * verbatim as the password — do not decode it a second time). It is
         * encoded so the API can carry it as binary; the external importer
         * service needs it because it has no access to the user's keys and cannot
         * decrypt the encrypted passphrase itself.
         *
         * @param folderName - Name of the import folder (defaults to `'drive-import-<ISO timestamp>'`).
         */
        prepareImportFolder: (folderName?: string) => Promise<{
            encryptedName: string;
            hash: string;
            armoredKey: string;
            armoredNodePassphrase: string;
            armoredNodePassphraseSignature: string;
            armoredHashKey: string;
            signatureEmail: string;
            base64Passphrase: string;
            armoredExtendedAttributes?: string;
        }>;
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
        featureFlagProvider,
        latestEventIdProvider,
    }: ProtonDriveClientContructorParameters) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }
        if (!featureFlagProvider) {
            featureFlagProvider = new NullFeatureFlagProvider();
        }
        this.logger = telemetry.getLogger('interface');

        const fullConfig = getConfig(config);
        this.sdkEvents = new SDKEvents(telemetry);
        const cryptoModule = new DriveCrypto(telemetry, openPGPCryptoModule, srpModule);
        const apiService = new DriveAPIService(
            telemetry,
            this.sdkEvents,
            httpClient,
            fullConfig.baseUrl,
            fullConfig.language,
        );
        this.shares = initSharesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initNodesModule(
            telemetry,
            apiService,
            entitiesCache,
            cryptoCache,
            account,
            cryptoModule,
            this.shares,
            fullConfig.clientUid,
        );
        this.sharing = initSharingModule(
            telemetry,
            apiService,
            entitiesCache,
            account,
            cryptoModule,
            this.shares,
            this.nodes.access,
        );
        this.download = initDownloadModule(
            telemetry,
            apiService,
            cryptoModule,
            account,
            this.shares,
            this.nodes.access,
            this.nodes.revisions,
        );
        this.upload = initUploadModule(
            telemetry,
            apiService,
            cryptoModule,
            this.shares,
            this.nodes.access,
            featureFlagProvider,
            fullConfig.clientUid,
        );
        this.devices = initDevicesModule(
            telemetry,
            apiService,
            cryptoModule,
            this.shares,
            this.nodes.access,
            this.nodes.management,
        );
        // These are used to keep the internal cache up to date.
        // Listeners receive both public DriveEvents and SDK-only
        // InternalDriveEvents and should filter on event.type.
        const cacheEventListeners: ((event: DriveEvent | InternalDriveEvent) => Promise<void>)[] = [
            this.nodes.eventHandler.updateNodesCacheOnEvent.bind(this.nodes.eventHandler),
            this.sharing.eventHandler.handleDriveEvent.bind(this.sharing.eventHandler),
        ];
        this.events = new DriveEventsService(
            telemetry,
            apiService,
            this.shares,
            cacheEventListeners,
            latestEventIdProvider,
        );

        this.publicSessionManager = new SharingPublicSessionManager(
            telemetry,
            httpClient,
            cryptoModule,
            srpModule,
            apiService,
        );

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
            getPublicLinkInfo: async (url: string) => {
                const { token } = getTokenAndPasswordFromUrl(url);
                this.logger.info(`Getting info for public link token ${token}`);
                return this.publicSessionManager.getInfo(token);
            },
            authPublicLink: async (url: string, customPassword?: string, isAnonymousContext: boolean = false) => {
                const { token, password: urlPassword } = getTokenAndPasswordFromUrl(url);
                this.logger.info(`Authenticating public link token ${token}`);

                const { httpClient, shareKey, sharePassphrase, shareUrlPassword, rootUid, publicRole, session } =
                    await this.publicSessionManager.auth(token, urlPassword, customPassword);
                return new ProtonDrivePublicLinkClient({
                    httpClient,
                    account,
                    openPGPCryptoModule,
                    srpModule,
                    config,
                    telemetry,
                    url,
                    token,
                    publicShareKey: shareKey,
                    publicSharePassphrase: sharePassphrase,
                    shareUrlPassword,
                    publicRootNodeUid: rootUid,
                    isAnonymousContext,
                    publicRole,
                    session,
                });
            },
            processCoreEvent: async (rawEvent: CoreApiEvent) => {
                this.logger.debug(`Processing core event ${rawEvent.EventID}`);
                return this.events.processCoreEvent(rawEvent);
            },
            prepareImportFolder: async (folderName?: string) => {
                const name = folderName ?? `drive-import-${new Date().toISOString()}`;
                this.logger.info('Preparing import folder crypto material');
                const rootFolder = await this.nodes.access.getVolumeRootFolder();
                return this.nodes.management.prepareImportFolderCryptoMaterial(rootFolder.uid, name);
            },
        };
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
     * Provides the remote data updates for all files and folders in a given
     * tree scope.
     *
     * In order to keep local data up to date, the client must call this method
     * to receive events on updates and to keep the SDK cache in sync.
     *
     * When no lastEventId is provided, the FastForward with the latest event
     * ID is yielded.
     *
     * Use `getEventScheduler` to schedule the polling of the events.
     *
     * @param treeEventScopeId - The scope ID of the tree to read events for (same as `treeEventScopeId` on nodes)
     * @param lastEventId - The last event ID you have fully processed for this scope; omit to start from the latest event
     * @param signal - Signal to abort the operation
     * @returns An async generator of the events for the given scope.
     */
    async *iterateEvents(
        treeEventScopeId: string,
        lastEventId?: string,
        signal?: AbortSignal,
    ): AsyncGenerator<DriveEvent> {
        this.logger.info(`Iterating events for tree scope ${treeEventScopeId}`);
        yield* this.events.iterateEvents(treeEventScopeId, lastEventId, signal);
    }

    /**
     * Provides a scheduler that invokes the callback on a timer for each
     * registered tree event scope. Own volumes poll at the foreground rate;
     * shared volumes poll at the background rate unless promoted via
     * `setForeground`. Only one non-own volume can be in the foreground at
     * a time.
     *
     * Only one instance of the SDK should subscribe to updates.
     *
     * @param callback - Callback to be called when the events should be polled.
     * @returns The event scheduler.
     */
    async getEventScheduler(callback: (eventTreeScopeId: string) => Promise<void>): Promise<EventScheduler> {
        this.logger.info('Getting event scheduler');
        return this.events.getEventScheduler(callback);
    }

    /**
     * Subscribes to the remote data updates for all files and folders in a
     * tree.
     *
     * In order to keep local data up to date, the client must call this method
     * to receive events on update and to keep the SDK cache in sync.
     *
     * The `treeEventScopeId` can be obtained from node properties.
     *
     * Only one instance of the SDK should subscribe to updates.
     *
     * @deprecated Use `iterateEvents` instead.
     */
    async subscribeToTreeEvents(treeEventScopeId: string, callback: DriveListener): Promise<EventSubscription> {
        this.logger.debug('Subscribing to node updates');
        return this.events.subscribeToTreeEvents(treeEventScopeId, callback);
    }

    /**
     * Subscribes to the remote general data updates.
     *
     * Only one instance of the SDK should subscribe to updates.
     *
     * @deprecated Use `experimental.processCoreEvent` instead.
     */
    async subscribeToDriveEvents(callback: DriveListener): Promise<EventSubscription> {
        this.logger.debug('Subscribing to core updates');
        return this.events.subscribeToCoreEvents(callback);
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
    async getMyFilesRootFolder(): Promise<NodeEntity> {
        this.logger.info('Getting my files root folder');
        return convertInternalNodePromise(this.nodes.access.getVolumeRootFolder());
    }

    /**
     * Iterates the UIDs of the children of the given parent node.
     *
     * The output is not sorted and the order of the UIDs is not guaranteed.
     *
     * @param parentNodeUid - Node entity or its UID string.
     * @param filterOptions - Filter options.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the UIDs of the children of the given parent node.
     */
    async *iterateFolderChildrenNodeUids(
        parentNodeUid: NodeOrUid,
        filterOptions?: { type?: NodeType },
        signal?: AbortSignal,
    ): AsyncGenerator<string> {
        this.logger.info(`Iterating children of ${getUid(parentNodeUid)}`);
        yield* this.nodes.access.iterateFolderChildrenNodeUids(getUid(parentNodeUid), filterOptions, signal);
    }

    /**
     * Iterates the UIDs of the trashed nodes.
     *
     * The output is not sorted and the order of the UIDs is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the UIDs of the trashed nodes.
     */
    async *iterateTrashedNodeUids(signal?: AbortSignal): AsyncGenerator<string> {
        this.logger.info('Iterating trashed node UIDs');
        yield* this.nodes.access.iterateTrashedNodeUids(signal);
    }

    /**
     * Iterates the children of the given parent node.
     *
     * The output is not sorted and the order of the children is not guaranteed.
     *
     * @param parentNodeUid - Node entity or its UID string.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the children of the given parent node.
     * @deprecated Use `iterateFolderChildrenNodeUids` instead.
     */
    async *iterateFolderChildren(
        parentNodeUid: NodeOrUid,
        filterOptions?: { type?: NodeType },
        signal?: AbortSignal,
    ): AsyncGenerator<NodeEntity> {
        this.logger.info(`Iterating children of ${getUid(parentNodeUid)}`);
        const iterator = this.nodes.access.iterateFolderChildren(getUid(parentNodeUid), filterOptions, signal);
        yield* convertInternalNodeIterator(iterator);
    }

    /**
     * Iterates the trashed nodes.
     *
     * The list of trashed nodes is not cached and is fetched from the server
     * on each call. The node data itself are served from cached if available.
     *
     * The output is not sorted and the order of the trashed nodes is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the trashed nodes.
     * @deprecated Use `iterateTrashedNodeUids` instead.
     */
    async *iterateTrashedNodes(signal?: AbortSignal): AsyncGenerator<NodeEntity> {
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
    async *iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<MaybeMissingNode> {
        this.logger.info(`Iterating ${nodeUids.length} nodes`);
        yield* convertInternalMissingNodeIterator(this.nodes.access.iterateNodes(getUids(nodeUids), signal));
    }

    /**
     * Get the node by its UID.
     *
     * @param nodeUid - Node entity or its UID string.
     * @returns The node entity.
     */
    async getNode(nodeUid: NodeOrUid): Promise<NodeEntity> {
        this.logger.info(`Getting node ${getUid(nodeUid)}`);
        return convertInternalNodePromise(this.nodes.access.getNode(getUid(nodeUid)));
    }

    /**
     * Get the node hierarchy for the given node.
     *
     * The hierarchy is returned as a list of nodes. The first node is the root
     * node, the last node is the given node.
     *
     * @param nodeUid - Node entity or its UID string.
     * @returns The list of nodes from root to the given node.
     */
    async getNodeHierarchy(nodeUid: NodeOrUid): Promise<NodeEntity[]> {
        this.logger.info(`Getting node hierarchy for ${getUid(nodeUid)}`);
        const hierarchy = await this.nodes.access.getNodeHierarchy(getUid(nodeUid));
        return hierarchy.map(convertInternalNode);
    }

    /**
     * Rename the node.
     *
     * @param nodeUid - Node entity or its UID string.
     * @returns The updated node entity.
     * @throws {@link ValidationError} If the name is empty, too long, or contains a slash.
     * @throws {@link ValidationError} If another node with the same name already exists.
     */
    async renameNode(nodeUid: NodeOrUid, newName: string): Promise<NodeEntity> {
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
    async *moveNodes(
        nodeUids: NodeOrUid[],
        newParentNodeUid: NodeOrUid,
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResult> {
        this.logger.info(`Moving ${nodeUids.length} nodes to ${getUid(newParentNodeUid)}`);
        yield* this.nodes.management.moveNodes(getUids(nodeUids), getUid(newParentNodeUid), signal);
    }

    /**
     * Copy the nodes to a new parent node.
     *
     * The operation is performed node by node and the results are yielded
     * as they are available. Order of the results is not guaranteed.
     *
     * The `nodeUids` can be a list of node entities or their UIDs, or a list
     * of objects with `uid` and `name` properties where the name is the new
     * name of the copied node. By default, the name is the same as the
     * original node. Use `getAvailableName` to get the available name for the
     * new node in the target parent node in case of a name conflict.
     *
     * If one of the nodes fails to copy, the operation continues with the
     * rest of the nodes. Use `NodeResult` to check the status of the action.
     *
     * @param nodesOrNodeUidsOrWithNames - List of node entities or their UIDs.
     * @param newParentNodeUid - Node entity or its UID string.
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the results of the copy operation
     */
    async *copyNodes(
        nodesOrNodeUidsOrWithNames: (NodeOrUid | { uid: string; name: string })[],
        newParentNodeUid: NodeOrUid,
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResultWithNewUid> {
        this.logger.info(`Copying ${nodesOrNodeUidsOrWithNames.length} nodes to ${getUid(newParentNodeUid)}`);

        const nodeUidsOrWithNames = nodesOrNodeUidsOrWithNames.map((param) => {
            if (typeof param === 'string') {
                return param;
            }
            if ('uid' in param && 'name' in param && typeof param.uid === 'string' && typeof param.name === 'string') {
                return { uid: param.uid, name: param.name };
            }
            return getUid(param);
        });

        yield* this.nodes.management.copyNodes(nodeUidsOrWithNames, getUid(newParentNodeUid), signal);
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
    async *trashNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
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
    async *restoreNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Restoring ${nodeUids.length} nodes`);
        yield* this.nodes.management.restoreNodes(getUids(nodeUids), signal);
    }

    /**
     * Delete the trashed nodes permanently. Only the owner can do that.
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
    async *deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        this.logger.info(`Deleting ${nodeUids.length} nodes`);
        yield* this.nodes.management.deleteTrashedNodes(getUids(nodeUids), signal);
    }

    async emptyTrash(): Promise<void> {
        this.logger.info('Emptying trash');
        return this.nodes.management.emptyTrash();
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
    async createFolder(parentNodeUid: NodeOrUid, name: string, modificationTime?: Date): Promise<NodeEntity> {
        this.logger.info(`Creating folder in ${getUid(parentNodeUid)}`);
        return convertInternalNodePromise(
            this.nodes.management.createFolder(getUid(parentNodeUid), name, modificationTime),
        );
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
    async *iterateRevisions(nodeUid: NodeOrUid, signal?: AbortSignal): AsyncGenerator<Revision> {
        this.logger.info(`Iterating revisions of ${getUid(nodeUid)}`);
        yield* convertInternalRevisionIterator(this.nodes.revisions.iterateRevisions(getUid(nodeUid), signal));
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
    async restoreRevision(revisionUid: RevisionOrUid): Promise<void> {
        this.logger.info(`Restoring revision ${getUid(revisionUid)}`);
        await this.nodes.revisions.restoreRevision(getUid(revisionUid));
    }

    /**
     * Delete the revision.
     *
     * @param revisionUid - UID of the revision to delete.
     */
    async deleteRevision(revisionUid: RevisionOrUid): Promise<void> {
        this.logger.info(`Deleting revision ${getUid(revisionUid)}`);
        await this.nodes.revisions.deleteRevision(getUid(revisionUid));
    }

    /**
     * Iterates the UIDs of the nodes shared by the user.
     *
     * The output is not sorted and the order of the UIDs is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the UIDs of the shared nodes by the user.
     */
    async *iterateSharedNodeUids(signal?: AbortSignal): AsyncGenerator<string> {
        this.logger.info('Iterating shared nodes by me');
        yield* this.sharing.access.iterateSharedNodeUids(signal);
    }

    /**
     * Iterates the UIDs of the nodes shared with the user.
     *
     * The output is not sorted and the order of the UIDs is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the UIDs of the shared nodes with the user.
     */
    async *iterateSharedWithMeNodeUids(signal?: AbortSignal): AsyncGenerator<string> {
        this.logger.info('Iterating shared nodes with me');
        yield* this.sharing.access.iterateSharedWithMeNodeUids(signal);
    }

    /**
     * Iterates the nodes shared by the user.
     *
     * The output is not sorted and the order of the shared nodes is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the shared nodes.
     * @deprecated Use `iterateSharedNodeUids` instead.
     */
    async *iterateSharedNodes(signal?: AbortSignal): AsyncGenerator<NodeEntity> {
        this.logger.info('Iterating shared nodes by me');
        yield* convertInternalNodeIterator(this.sharing.access.iterateSharedNodes(signal));
    }

    /**
     * Iterates the nodes shared with the user.
     *
     * The output is not sorted and the order of the shared nodes is not guaranteed.
     *
     * Clients can subscribe to drive events in order to receive a
     * `SharedWithMeUpdated` event when there are changes to the user's
     * access to shared nodes.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the shared nodes.
     * @deprecated Use `iterateSharedWithMeNodeUids` instead.
     */
    async *iterateSharedNodesWithMe(signal?: AbortSignal): AsyncGenerator<NodeEntity> {
        this.logger.info('Iterating shared nodes with me');

        for await (const node of this.sharing.access.iterateSharedNodesWithMe(signal)) {
            yield convertInternalNode(node);
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
    async *iterateInvitations(signal?: AbortSignal): AsyncGenerator<ProtonInvitationWithNode> {
        this.logger.info('Iterating invitations');
        yield* this.sharing.access.iterateInvitations(signal);
    }

    /**
     * Accept the invitation to the shared node.
     *
     * @param invitationUid - Invitation entity or its UID string.
     */
    async acceptInvitation(invitationUid: ProtonInvitationOrUid): Promise<void> {
        this.logger.info(`Accepting invitation ${getUid(invitationUid)}`);
        await this.sharing.access.acceptInvitation(getUid(invitationUid));
    }

    /**
     * Reject the invitation to the shared node.
     *
     * @param invitationUid - Invitation entity or its UID string.
     */
    async rejectInvitation(invitationUid: ProtonInvitationOrUid): Promise<void> {
        this.logger.info(`Rejecting invitation ${getUid(invitationUid)}`);
        await this.sharing.access.rejectInvitation(getUid(invitationUid));
    }

    /**
     * Iterates the shared bookmarks.
     *
     * The output is not sorted and the order of the bookmarks is not guaranteed.
     *
     * @param signal - Signal to abort the operation.
     * @returns An async generator of the shared bookmarks.
     */
    async *iterateBookmarks(signal?: AbortSignal): AsyncGenerator<MaybeBookmark> {
        this.logger.info('Iterating shared bookmarks');
        yield* this.sharing.access.iterateBookmarks(signal);
    }

    /**
     * Create a shared bookmark for a public link.
     *
     * @param url - The public link url.
     * @param customPassword - The optional custom password.
     */
    async createBookmark(url: string, customPassword?: string): Promise<void> {
        const { token, password: urlPassword } = getTokenAndPasswordFromUrl(url);
        this.logger.info(`Creating bookmark for token ${token}`);
        await this.sharing.access.createBookmark(token, urlPassword, customPassword);
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

    /**
     * Convert a non-Proton invitation to an internal invitation.
     * This is called automatically in the background when the SDK receives
     * a metadata update event, but can also be triggered manually.
     *
     * @param nodeUid - Node entity or its UID string.
     * @param invitationOrUid - Non-Proton invitation entity or its UID string.
     */
    async convertNonProtonInvitation(
        nodeUid: NodeOrUid,
        invitationOrUid: NonProtonInvitationOrUid,
    ): Promise<ProtonInvitation> {
        this.logger.info(`Converting non-Proton invitation ${getUid(invitationOrUid)} for node ${getUid(nodeUid)}`);
        return this.sharing.management.convertNonProtonInvitation(getUid(nodeUid), getUid(invitationOrUid));
    }

    /**
     * Resend the invitation email to shared node.
     *
     * @param nodeUid - Node entity or its UID string.
     * @param invitationUid - Invitation entity or its UID string.
     */
    async resendInvitation(
        nodeUid: NodeOrUid,
        invitationUid: ProtonInvitationOrUid | NonProtonInvitationOrUid,
    ): Promise<void> {
        this.logger.info(`Resending invitation ${getUid(invitationUid)}`);
        return this.sharing.management.resendInvitationEmail(getUid(nodeUid), getUid(invitationUid));
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
     * const downloadController = fileDownloader.downloadToStream(stream, (downloadedBytes) => { ... });
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
     * const uploadController = await uploader.uploadFromStream(stream, thumbnails, (uploadedBytes) => { ... });
     *
     * signalController.abort(); // to cancel
     * uploadController.pause(); // to pause
     * uploadController.resume(); // to resume
     * const { nodeUid, nodeRevisionUid } = await uploadController.completion(); // to await completion
     * ```
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
     */
    async getFileRevisionUploader(
        nodeUid: NodeOrUid,
        metadata: UploadMetadata,
        signal?: AbortSignal,
    ): Promise<FileUploader> {
        this.logger.info(`Getting file revision uploader for ${getUid(nodeUid)}`);
        return this.upload.getFileRevisionUploader(getUid(nodeUid), metadata, signal);
    }

    /**
     * Returns the available name for the file in the given parent folder.
     *
     * The function will return a name that includes the original name with the
     * available index. The name is guaranteed to be unique in the parent folder.
     *
     * Example new name: `file (2).txt`.
     */
    async getAvailableName(parentFolderUid: NodeOrUid, name: string): Promise<string> {
        this.logger.info(`Getting available name in folder ${getUid(parentFolderUid)}`);
        return this.nodes.management.findAvailableName(getUid(parentFolderUid), name);
    }

    /**
     * Iterates the devices of the user.
     *
     * The output is not sorted and the order of the devices is not guaranteed.
     *
     * New devices can be registered by listening to events in the
     * event scope of "My Files" and filtering on nodes with null `ParentLinkId`.
     *
     * @returns An async generator of devices.
     */
    async *iterateDevices(signal?: AbortSignal): AsyncGenerator<Device> {
        this.logger.info('Iterating devices');
        yield* this.devices.iterateDevices(signal);
    }

    /**
     * Get the device entity by its UID.
     *
     * @param deviceOrUid - Device entity or its UID string.
     * @returns The device entity.
     * @throws {@link ValidationError} If the device is not found.
     */
    async getDevice(deviceOrUid: DeviceOrUid): Promise<Device> {
        this.logger.info(`Getting device ${getUid(deviceOrUid)}`);
        return this.devices.getDevice(getUid(deviceOrUid));
    }

    /**
     * Creates a new device.
     *
     * @param name - Name of the device.
     * @param deviceType - Type of the device.
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

    /**
     * Report a directly shared node for abuse.
     *
     * This reports a node (or a specific sub-node and revision) that the
     * authenticated user has access to via a direct share invitation or
     * membership. The `bonaFide` flag must be explicitly set to `true`
     * as a legal acknowledgment per DSA requirements.
     *
     * @param settings - Report details. `nodeUid` is required and must be a
     *   node the caller has access to via a direct share.
     */
    async reportAbuse(settings: ReportDirectShareAbuseSettings): Promise<void> {
        this.logger.info(`Reporting abuse for node ${settings.nodeUid}`);
        await this.sharing.management.reportAbuse(settings);
    }
}
