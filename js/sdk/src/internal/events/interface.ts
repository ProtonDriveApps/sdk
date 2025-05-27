/**
 * Callback that accepts list of Drive events and flag whether no
 * event should be processed, but rather full cache refresh should be
 * performed.
 * 
 * @param fullRefreshVolumeId - ID of the volume that should be fully refreshed.
 */
export type DriveListener = (events: DriveEvent[], fullRefreshVolumeId?: string) => Promise<void>;

/**
 * Generic internal event interface representing a list of events
 * with metadata about the last event ID, whether there are more
 * events to fetch, or whether the listener should refresh its state.
 */
export type Events<T> = {
    lastEventId: string,
    more: boolean,
    refresh: boolean,
    events: T[],
}

/**
 * Internal event interface representing a list of specific Drive events.
 */
export type DriveEvents = Events<DriveEvent>;

export type DriveEvent = {
    type: DriveEventType.NodeCreated | DriveEventType.NodeUpdated | DriveEventType.NodeUpdatedMetadata,
    nodeUid: string,
    parentNodeUid?: string,
    isTrashed: boolean,
    isShared: boolean,
    isOwnVolume: boolean,
} | {
    type: DriveEventType.NodeDeleted,
    nodeUid: string,
    parentNodeUid?: string,
    isTrashed?: boolean,
    isShared?: boolean,
    isOwnVolume: boolean,
} | {
    type: DriveEventType.ShareWithMeUpdated,
}

export enum DriveEventType {
    NodeCreated = 'node_created',
    NodeUpdated = 'node_updated',
    NodeUpdatedMetadata = 'node_updated_metadata',
    NodeDeleted = 'node_deleted',
    ShareWithMeUpdated = 'share_with_me_updated',
}
