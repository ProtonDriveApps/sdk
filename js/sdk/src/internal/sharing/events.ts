import { Logger } from '../../interface';
import { DriveEvent, DriveEventType } from '../events';
import { SharingCache } from './cache';
import { SharesService } from './interface';

export class SharingEventHandler {
    constructor(
        private logger: Logger,
        private cache: SharingCache,
        private shares: SharesService,
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
            if (event.type === DriveEventType.SharedWithMeUpdated) {
                await this.cache.setSharedWithMeNodeUids(undefined);
                return;
            }
            if (!(await this.shares.isOwnVolume(event.treeEventScopeId))) {
                return;
            }
            if (event.type === DriveEventType.NodeCreated || event.type == DriveEventType.NodeUpdated) {
                if (event.isShared && !event.isTrashed) {
                    await this.cache.addSharedByMeNodeUid(event.nodeUid);
                } else {
                    await this.cache.removeSharedByMeNodeUid(event.nodeUid);
                }
                return;
            }
            if (event.type === DriveEventType.NodeDeleted) {
                await this.cache.removeSharedByMeNodeUid(event.nodeUid);
                return;
            }
            if (event.type === DriveEventType.TreeRefresh || event.type === DriveEventType.TreeRemove) {
                await this.cache.setSharedWithMeNodeUids(undefined);
            }
        } catch (error: unknown) {
            this.logger.error(`Skipping shared by me node cache update`, error);
        }
    }
}
