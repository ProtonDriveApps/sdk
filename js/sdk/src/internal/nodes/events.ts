import { NodeEventCallback } from "../../interface/index";
import { DriveEventsService } from "../events/index";
import { NodesCache } from "./cache";

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
    private listeners: { condition: (nodeEventInfo: NodeEventInfo) => boolean, callback: NodeEventCallback }[] = [];

    constructor(
        private cache: NodesCache,
        private events: DriveEventsService,
    ) {
        this.cache = cache;
        this.events = events;

        // TODO: handler for saving to internal cache
        // errors should not be ignored until event is processed - how to give up after some time?
        events.registerHandler(async (event) => {
            if (event.type === 'node_created') {
                try {
                    const parentNode = await cache.getNode(event.parentNodeUid);
                    // TODO: do not fetch and decrypt, only save to cache there is new node
                } catch (err) {
                    // TODO: ignore if missing in cache
                    throw err;
                }
            }
            if (event.type === 'node_updated' || event.type === 'node_updated_metadata') {
                try {
                    const node = await cache.getNode(event.nodeUid);
                    node.isStale = true;
                    await cache.setNode(node);
                } catch (err) {
                    // TODO: ignore if missing in cache
                    throw err;
                }
            }
            if (event.type === 'node_deleted') {
                try {
                    await cache.removeNodes([event.nodeUid]);
                } catch (err) {
                    // TODO: ignore if missing in cache
                    throw err;
                }
            }
        });

        // TODO: ignore errors if this doesn't work so events can continue
        // but log them and how to report to the caller?
        events.registerHandler(async (event) => {
            if (event.type === 'node_created' || event.type === 'node_updated' || event.type === 'node_updated_metadata') {
                await Promise.all(this.listeners.map(async ({ condition, callback }) => {
                    if (condition(event)) {
                        // TODO: do fetch and decrypt, not only cache
                        const node = await cache.getNode(event.nodeUid);
                        callback({ type: 'update', uid: node.uid, node: node as any });
                    }
                }));
            }
            if (event.type === 'node_deleted') {
                await Promise.all(this.listeners.map(async ({ condition, callback }) => {
                    if (condition(event)) {
                        callback({ type: 'remove', uid: event.nodeUid });
                    }
                }));
            }
        });
    }


    // TODO: transform internal events to outside events that also fetches whole object and decrypts it
    // TODO: hook it up after the cache is updated from above

    // TODO: subscrition to shared by me or trashed nodes needs fetch of every node (to get sharing or trashing info), but not necessarily decryption if not needed node
    // TODO: shared by me should be handled in sharing module?
    subscribeToSharedNodesByMe(callback: NodeEventCallback) {
        this.listeners.push({ condition: ({ isShared }) => isShared || false, callback });
    }

    subscribeToTrashedNodes(callback: NodeEventCallback) {
        this.listeners.push({ condition: ({ isTrashed }) => isTrashed || false, callback });
    }

    // TODO: subscription to children needs info about parent - if parent is matching, it will fetch and decrypt
    subscribeToChildren(parentNodeUid: string, callback: NodeEventCallback) {
        this.listeners.push({ condition: ({ parentNodeUid: parent }) => parent === parentNodeUid, callback });
    }
}
