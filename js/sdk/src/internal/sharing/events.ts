import { Logger } from '../../interface';
import { DriveEvent, DriveEventType } from '../events';
import { SharingCache } from './cache';
import { NodesService, SharesService } from './interface';

export class SharingEventHandler {
    constructor(
        private logger: Logger,
        private cache: SharingCache,
        private shares: SharesService,
        private nodesService: NodesService,
    ) {}

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
    async handleDriveEvent(event: DriveEvent) {
        try {
            await this.handleSharedWithMeNodeUidsLoaded(event);
            await this.handleSharedByMeNodeUidsLoaded(event);
        } catch (error: unknown) {
            this.logger.error(`Skipping sharing cache update`, error);
        }
    }

    private async handleSharedWithMeNodeUidsLoaded(event: DriveEvent) {
        if (
            ![DriveEventType.SharedWithMeUpdated, DriveEventType.TreeRefresh, DriveEventType.TreeRemove].includes(
                event.type,
            )
        ) {
            return;
        }

        // When user changes the membership (permissions) for a user, the
        // backend emits both NodeUpdated and SharedWithMeUpdated events.
        // Ideally, the SDK doesn't have to refresh all the shared nodes,
        // only those that were changed via the NodeUpdated event. However,
        // the client very likely will not be subscribed to all shared volumes.
        // When the client only lists the list itself and not the trees, it
        // is still required to refresh all the nodes to be sure to have the
        // latest state.
        // The sharing module doesn't have access to the nodes cache, thus
        // it notifies the nodes via the service. If this fails, we need to
        // log it, but it should not block the event handling. The node might
        // be wrong at the "shared with me" listing, but it will be eventually
        // updated once the user opens the volume tree and client processes
        // the events for that volume.
        // Ideally, in the future, the Drive API provides a custom event with
        // indication of what node was added or removed or updated, instead
        // of emitting destructive SharedWithMeUpdated event.
        const hasSharedWithMeLoaded = await this.cache.hasSharedWithMeNodeUidsLoaded();
        if (event.type === DriveEventType.SharedWithMeUpdated && hasSharedWithMeLoaded) {
            try {
                const sharedWithMeNodeUids = await this.cache.getSharedWithMeNodeUids();
                this.logger.debug(`Shared with me updated, notifying ${sharedWithMeNodeUids.length} nodes`);
                for (const nodeUid of sharedWithMeNodeUids) {
                    await this.nodesService.notifyNodeChanged(nodeUid);
                }
            } catch (error: unknown) {
                this.logger.error(`Skipping shared with me node cache update`, error);
            }
        }

        await this.cache.setSharedWithMeNodeUids(undefined);
    }

    private async handleSharedByMeNodeUidsLoaded(event: DriveEvent) {
        if (
            ![DriveEventType.NodeCreated, DriveEventType.NodeUpdated, DriveEventType.NodeDeleted].includes(event.type)
        ) {
            return;
        }

        const hasSharedByMeLoaded = await this.cache.hasSharedByMeNodeUidsLoaded();
        if (!hasSharedByMeLoaded) {
            return;
        }

        const isOwnVolume = await this.shares.isOwnVolume(event.treeEventScopeId);
        if (!isOwnVolume) {
            return;
        }

        if (event.type === DriveEventType.NodeCreated || event.type == DriveEventType.NodeUpdated) {
            if (event.isShared && !event.isTrashed) {
                await this.cache.addSharedByMeNodeUid(event.nodeUid);
            } else {
                await this.cache.removeSharedByMeNodeUid(event.nodeUid);
            }
        }
        if (event.type === DriveEventType.NodeDeleted) {
            await this.cache.removeSharedByMeNodeUid(event.nodeUid);
        }
    }
}
