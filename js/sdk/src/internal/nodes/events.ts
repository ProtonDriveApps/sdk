import { Logger, NodeEventCallback } from "../../interface";
import { DriveEventsService, DriveEvent, DriveEventType } from "../events";
import { DecryptedNode } from "./interface";
import { NodesCache } from "./cache";
import { NodesAccess } from "./nodesAccess";

type Listeners = {
    /**
     * Condition for the listener to be notified about the event.
     * 
     * The condition is a function that receives the event information
     * and returns true if the listener should be notified about the
     * event.
     */
    condition: (nodeEventInfo: NodeEventInfo) => boolean,
    callback: NodeEventCallback,
}[];

/**
 * Minimal information about the event that is used for listener
 * condition. The information is used to determine if the listener
 * should be notified about the event.
 * 
 * This must come from the API response to volume events.
 */
type NodeEventInfo = {
    parentNodeUid: string,
    isTrashed?: boolean,
    isShared?: boolean,
}

/**
 * Provides both event handling and subscription mechanism for user.
 * 
 * The service is responsible for handling events regarding node metadata
 * from the DriveEventsService, and for providing a subscription mechanism
 * for the user to listen to updates of specific group of nodes, such as
 * any update for trashed nodes.
 */
export class NodesEvents {
    private listeners: Listeners = [];

    constructor(logger: Logger, events: DriveEventsService, cache: NodesCache, nodesAccess: NodesAccess) {
        events.addListener(async (events, fullRefreshVolumeId) => {
            if (fullRefreshVolumeId) {
                await cache.setNodesStaleFromVolume(fullRefreshVolumeId);
                return;
            }

            for (const event of events) {
                await updateCacheByEvent(logger, event, cache);
            }
        });

        events.addListener(async (events) => {
            for (const event of events) {
                await notifyListenersByEvent(logger, event, this.listeners, cache, nodesAccess);
            }
        });
    }

    subscribeToTrashedNodes(callback: NodeEventCallback) {
        this.listeners.push({ condition: ({ isTrashed }) => isTrashed || false, callback });
    }

    subscribeToChildren(parentNodeUid: string, callback: NodeEventCallback) {
        this.listeners.push({ condition: ({ parentNodeUid: parent }) => parent === parentNodeUid, callback });
    }
}

/**
 * For given event, update the cache accordingly.
 * 
 * The function is responsible for updating the cache based on the
 * event received from the DriveEventsService. The cache metadata
 * are not updated, only the nodes are marked as stale to be
 * fetched and decrypted again when requested by the client.
 * 
 * If the node is not found in the cache, the event is silently
 * skipped as the node will be fetched and decrypted when requested
 * by the client.
 * 
 * If the node cannot be updated in the cache, the node is removed
 * from the cache to not block the client. If the node is not possible
 * to remove, the function throws an error.
 * 
 * @throws Only if the node is not possible to remove from the cache.
 */
export async function updateCacheByEvent(logger: Logger, event: DriveEvent, cache: NodesCache) {
    // NodeCreated event is ignored as we do not want to fetch and
    // decrypt the node immediately. The node will be fetched and
    // decrypted when requested by the client.
    if (event.type === DriveEventType.NodeCreated) {
        // We do not have partial nodes in the cache, so we don't
        // add it. If new node is not added, we need to reset the
        // children loaded flag to force refetch when requested.
        await cache.resetFolderChildrenLoaded(event.parentNodeUid);
    }
    if (event.type === DriveEventType.NodeUpdated || event.type === DriveEventType.NodeUpdatedMetadata) {
        let node;
        // getNode can fail if the node is not found or if it is
        // corrupted. In later case, it will be automatically
        // removed from cache. In both cases, lets skip the event
        // silently as once requested by client, the node will
        // be cached again.
        try {
            node = await cache.getNode(event.nodeUid);
        } catch (error: unknown) {
            logger.debug(`Skipping node update event (node not in the cache): ${error}`);
        }
        if (node) {
            node.isStale = true;
            try {
                await cache.setNode(node);
            } catch (setNodeError: unknown) {
                logger.error(`Skipping node update event (failed to update)`, setNodeError);
                // If updating node in the cache is failing, lets remove it
                // to not block the whole client. If the node is not possible
                // to remove, lets throw at this point as cache is in very
                // bad state by this point and the rest of the code would start
                // to break randomly.
                try {
                    await cache.removeNodes([event.nodeUid]);
                } catch (removeNodeError: unknown) {
                    logger.error(`Skipping node update event (failed to remove after failed update)`, removeNodeError);
                    // removeNodeError is automatic correction algorithm.
                    // If that fails, lets throw the original error as that
                    // is the real problem.
                    throw setNodeError;
                }
            }
        }
    }
    if (event.type === DriveEventType.NodeDeleted) {
        // removeNodes can fail removing children.
        // We do not want to stop processing other events in such
        // a case. Lets log the error and continue.
        try {
            await cache.removeNodes([event.nodeUid]);
        } catch (error: unknown) {
            logger.error(`Skipping node delete event:`, error);
        }
    }
}

/**
 * For given event, notify the listeners accordingly.
 * 
 * The function is responsible for notifying the listeners about the
 * event received from the DriveEventsService. The listeners are
 * connected with events based on the condition, such as parent node
 * uid for listening to children updates.
 * 
 * The function is responsible for fetching and decrypting the latest
 * version of the node metadata. If the node is not found, the event
 * is silently skipped as the node will be fetched and decrypted when
 * requested by the client.
 * 
 * @throws Only if the client's callback throws.
 */
export async function notifyListenersByEvent(logger: Logger, event: DriveEvent, listeners: Listeners, cache: NodesCache, nodesAccess: NodesAccess) {
    if (event.type === DriveEventType.NodeCreated || event.type === DriveEventType.NodeUpdated || event.type === DriveEventType.NodeUpdatedMetadata) {
        const subscribedListeners = listeners.filter(({ condition }) => condition(event));
        if (subscribedListeners.length) {
            let node;
            try {
                node = await nodesAccess.getNode(event.nodeUid);
            } catch (error: unknown) {
                logger.error(`Skipping node update event to listener`, error);
                return;
            }
            subscribedListeners.forEach(({ callback }) => callback({ type: 'update', uid: node.uid, node }));
        }
    }

    if (event.type === DriveEventType.NodeDeleted) {
        let node: DecryptedNode;
        try {
            node = await cache.getNode(event.nodeUid);
        } catch {}

        const subscribedListeners = listeners.filter(({ condition }) => condition({
            isShared: node?.isShared || false,
            isTrashed: !!node?.trashedDate || false,
            ...event,
        }));
        if (subscribedListeners.length) {
            subscribedListeners.forEach(({ callback }) => callback({ type: 'remove', uid: event.nodeUid }));
        }
    }
}
