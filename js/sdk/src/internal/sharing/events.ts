import { NodeEventCallback, Logger } from "../../interface";
import { convertInternalNode } from "../../transformers";
import { DriveEventsService, DriveEvent, DriveEventType } from "../events";
import { SharingCache } from "./cache";
import { SharingType, NodesService } from "./interface";
import { SharingAccess } from "./sharingAccess";

type Listeners = {
    type: SharingType,
    callback: NodeEventCallback,
}[];

/**
 * Provides both event handling and subscription mechanism for user.
 * 
 * The service is responsible for handling events regarding sharing listing
 * from the DriveEventsService, and for providing a subscription mechanism
 * for the user to listen to updates of specific group of nodes, such as
 * any update to list of shared with me nodes.
 */
export class SharingEvents {
    private listeners: Listeners = [];

    constructor(logger: Logger, events: DriveEventsService, cache: SharingCache, nodesService: NodesService, sharingAccess: SharingAccess) {
        events.addListener(async (events, fullRefreshVolumeId) => {
            // Technically we need to refresh only the shared by me nodes for
            // own volume, and shared with me nodes only when the event comes
            // as core refresh event is converted to it.
            // We can optimise later, for now we refresh everything to make
            // it simpler. The cache is smart enough to not do unnecessary
            // requests to the API and refresh on web is rare without
            // persistant cache for now.
            if (fullRefreshVolumeId) {
                await cache.setSharedByMeNodeUids(undefined);
                await cache.setSharedWithMeNodeUids(undefined);
                return
            }

            for (const event of events) {
                await handleSharedByMeNodes(logger, event, cache, this.listeners, nodesService);
                await handleSharedWithMeNodes(event, cache, this.listeners, sharingAccess);
            }
        });
    }

    subscribeToSharedNodesByMe(callback: NodeEventCallback) {
        this.listeners.push({ type: SharingType.SharedByMe, callback });
        return () => {
            this.listeners = this.listeners.filter(listener => listener.callback !== callback);
        }
    }

    subscribeToSharedNodesWithMe(callback: NodeEventCallback) {
        this.listeners.push({ type: SharingType.sharedWithMe, callback });
        return () => {
            this.listeners = this.listeners.filter(listener => listener.callback !== callback);
        }
    }
}

/**
 * Update cache and notify listeners accordingly for any updates
 * to nodes that are shared by me.
 *
 * Any node create or update that is being shared, is automatically
 * added to the cache and the listeners are notified about the
 * update of the node.
 *
 * Any node delete or update that is not being shared, and the cache
 * includes the node, is removed from the cache and the listeners are
 * notified about the removal of the node.
 *
 * @throws Only if the client's callback throws.
 */
export async function handleSharedByMeNodes(logger: Logger, event: DriveEvent, cache: SharingCache, listeners: Listeners, nodesService: NodesService) {
    if (event.type === DriveEventType.ShareWithMeUpdated || !event.isOwnVolume) {
        return;
    }

    const subscribedListeners = listeners.filter(({ type }) => type === SharingType.SharedByMe);

    if ([DriveEventType.NodeCreated, DriveEventType.NodeUpdated, DriveEventType.NodeUpdatedMetadata].includes(event.type) && event.isShared) {
        try {
            await cache.addSharedByMeNodeUid(event.nodeUid);
        } catch (error: unknown) {
            logger.error(`Skipping shared by me node cache update`, error);
        }
        if (subscribedListeners.length) {
            let node;
            try {
                node = await nodesService.getNode(event.nodeUid);
            } catch (error: unknown) {
                logger.error(`Skipping shared by me node update event to listener`, error);
                return;
            }
            subscribedListeners.forEach(({ callback }) => callback({ type: 'update', uid: node.uid, node: convertInternalNode(node) }));
        }
    }

    if (
        ((event.type === DriveEventType.NodeUpdated || event.type === DriveEventType.NodeUpdatedMetadata) && !event.isShared)
        || event.type === DriveEventType.NodeDeleted
    ) {
        let nodeWasShared = false;
        try {
            const cachedNodeUids = await cache.getSharedByMeNodeUids();
            nodeWasShared = cachedNodeUids.includes(event.nodeUid);
        } catch {
            // Cache can be empty.
        }

        if (nodeWasShared) {
            try {
                await cache.removeSharedByMeNodeUid(event.nodeUid);
            } catch (error: unknown) {
                logger.error(`Skipping shared by me node cache remove`, error);
            }
            subscribedListeners.forEach(({ callback }) => callback({ type: 'remove', uid: event.nodeUid }));
        }
    }
}

/**
 * Update cache and notify listeners accordingly for any updates
 * to nodes that are shared with me.
 *
 * There is only one event type that is relevant for shared with me
 * nodes, which is the ShareWithMeUpdated event. The event is triggered
 * when the list of shared with me nodes is updated.
 * 
 * The cache is cleared and re-populated fully when the client
 * requests the list of shared with me, or is actively listening.
 * 
 * If the client listenes to shared with me updates, the client receives
 * update to the full list of shared with me nodes, including remove
 * updates for nodes that are no longer shared with me, but was before.
 *
 * @throws Only if the client's callback throws.
 */
export async function handleSharedWithMeNodes(event: DriveEvent, cache: SharingCache, listeners: Listeners, sharingAccess: SharingAccess) {
    if (event.type !== DriveEventType.ShareWithMeUpdated) {
        return;
    }

    let cachedNodeUids: string[] = [];
    const subscribedListeners = listeners.filter(({ type }) => type === SharingType.sharedWithMe);
    if (subscribedListeners.length) {
        cachedNodeUids = await cache.getSharedWithMeNodeUids();
    }

    // Clearing the cache must be first, sharingAccess is no-op if cache is set.
    await cache.setSharedWithMeNodeUids(undefined);

    if (subscribedListeners.length) {
        const nodeUids = [];
        for await (const node of sharingAccess.iterateSharedNodesWithMe()) {
            nodeUids.push(node.uid);
            subscribedListeners.forEach(({ callback }) => callback({ type: 'update', uid: node.uid, node: convertInternalNode(node) }));
        }
        for (const nodeUid of cachedNodeUids) {
            if (!nodeUids.includes(nodeUid)) {
                subscribedListeners.forEach(({ callback }) => callback({ type: 'remove', uid: nodeUid }));
            }
        }
    }
}
