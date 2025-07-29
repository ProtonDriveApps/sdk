export enum SDKEvent {
    TransfersPaused = "transfersPaused",
    TransfersResumed = "transfersResumed",
    RequestsThrottled = "requestsThrottled",
    RequestsUnthrottled = "requestsUnthrottled",
}

export interface LatestEventIdProvider {
    getLatestEventId(treeEventScopeId: string): string | null;
}

/**
 * Callback that accepts list of Drive events and flag whether no
 * event should be processed, but rather full cache refresh should be
 * performed.
 *
 * Drive listeners should never throw and be wrapped in a try-catch loop.
 *
 * @param fullRefreshVolumeId - ID of the volume that should be fully refreshed.
 */
export type DriveListener = (event: DriveEvent) => Promise<void>;

type NodeCruEventType = DriveEventType.NodeCreated | DriveEventType.NodeUpdated;

export type NodeEvent = {
    type: NodeCruEventType,
    nodeUid: string,
    parentNodeUid?: string,
    isTrashed: boolean,
    isShared: boolean,
    treeEventScopeId: string,
    eventId: string,
} | {
    type: DriveEventType.NodeDeleted,
    nodeUid: string,
    parentNodeUid?: string,
    treeEventScopeId: string,
    eventId: string,
}

export type FastForwardEvent = {
    type: DriveEventType.FastForward,
    treeEventScopeId: string,
    eventId: string,
}

export type TreeRefreshEvent = {
    type: DriveEventType.TreeRefresh,
    treeEventScopeId: string,
    eventId: string,
}

export type TreeRemovalEvent = {
    type: DriveEventType.TreeRemove,
    treeEventScopeId: string,
    eventId: 'none',
}

export type SharedWithMeUpdated = {
    type: DriveEventType.SharedWithMeUpdated,
    eventId: string,
    treeEventScopeId: 'core',
}

export type DriveEvent = NodeEvent | FastForwardEvent | TreeRefreshEvent | TreeRemovalEvent | FastForwardEvent | SharedWithMeUpdated;

export enum DriveEventType {
    NodeCreated = 'node_created',
    NodeUpdated = 'node_updated',
    NodeDeleted = 'node_deleted',
    SharedWithMeUpdated = 'shared_with_me_updated',
    TreeRefresh = 'tree_refresh',
    TreeRemove = 'tree_remove',
    FastForward = 'fast_forward'
}
