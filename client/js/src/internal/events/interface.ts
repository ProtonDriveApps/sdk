import type { Logger } from '../../interface';

/**
 * Callback that accepts list of Drive events and flag whether no
 * event should be processed, but rather full cache refresh should be
 * performed.
 *
 * @param fullRefreshVolumeId - ID of the volume that should be fully refreshed.
 */
export type DriveListener = (event: DriveEvent) => Promise<void>;

export interface Event {
    eventId: string;
}

export interface EventSubscription {
    dispose(): void;
    /**
     * Returns the latest event ID for the subscription.
     *
     * @deprecated This is experimental to provide a way to the client to know
     * the latest event ID before getting any events. It will be removed and
     * replaced with a more robust solution.
     */
    getLatestEventId(): string | null;
}

export interface LatestEventIdProvider {
    getLatestEventId(treeEventScopeId: string): Promise<string | null>;
}

/**
 * Generic internal event interface representing a list of events
 * with metadata about the last event ID, whether there are more
 * events to fetch, or whether the listener should refresh its state.
 */
export type EventsListWithStatus<T> = {
    latestEventId: string;
    more: boolean;
    refresh: boolean;
    events: T[];
};

/**
 * Internal event interface representing a list of specific Drive events.
 */
export type DriveEventsListWithStatus = EventsListWithStatus<DriveEvent> & {
    convertibleExternalInvitationLinkIds: string[];
};

type NodeCruEventType = DriveEventType.NodeCreated | DriveEventType.NodeUpdated;
export type NodeEventType = NodeCruEventType | DriveEventType.NodeDeleted;

export type NodeEvent =
    | {
          type: NodeCruEventType;
          nodeUid: string;
          parentNodeUid?: string;
          isTrashed: boolean;
          isShared: boolean;
          treeEventScopeId: string;
          eventId: string;
      }
    | {
          type: DriveEventType.NodeDeleted;
          nodeUid: string;
          parentNodeUid?: string;
          treeEventScopeId: string;
          eventId: string;
      };

export type FastForwardEvent = {
    type: DriveEventType.FastForward;
    treeEventScopeId: string;
    eventId: string;
};

export type TreeRefreshEvent = {
    type: DriveEventType.TreeRefresh;
    treeEventScopeId: string;
    eventId: string;
};

export type TreeRemovalEvent = {
    type: DriveEventType.TreeRemove;
    treeEventScopeId: string;
    eventId: 'none';
};

export type SharedWithMeUpdated = {
    type: DriveEventType.SharedWithMeUpdated;
    eventId: string;
    treeEventScopeId: 'core';
};

export type DriveEvent =
    | NodeEvent
    | FastForwardEvent
    | TreeRefreshEvent
    | TreeRemovalEvent
    | SharedWithMeUpdated;

export enum DriveEventType {
    NodeCreated = 'node_created',
    NodeUpdated = 'node_updated',
    NodeDeleted = 'node_deleted',
    SharedWithMeUpdated = 'shared_with_me_updated',
    TreeRefresh = 'tree_refresh',
    TreeRemove = 'tree_remove',
    FastForward = 'fast_forward',
}

/**
 * Internal SDK events. These travel through the same fetch pipeline as
 * DriveEvent but are dispatched to a separate listener registry and are
 * never exposed to clients of the SDK.
 *
 * To add a new internal event: add a member to InternalEventType, add a
 * new shape to InternalDriveEvent, and handle it in
 * SharingEventHandler.handleInternalDriveEvent (or wherever appropriate).
 */
export enum InternalEventType {
    ConvertibleExternalInvitations = 'convertible_external_invitations',
}

export type InternalDriveEvent = {
    type: InternalEventType.ConvertibleExternalInvitations;
    treeEventScopeId: string;
    eventId: string;
    nodeUids: string[];
};

export function isInternalDriveEvent(
    event: DriveEvent | InternalDriveEvent,
): event is InternalDriveEvent {
    return event.type === InternalEventType.ConvertibleExternalInvitations;
}

/**
 * This can happen if all shared nodes in that volume where unshared or if the
 * volume was deleted.
 */
export class UnsubscribeFromEventsSourceError extends Error {}

export interface EventManagerInterface<T> {
    getLatestEventId(): Promise<string>;
    getEvents(eventId: string): AsyncIterable<T>;
    getLogger(): Logger;
}

export interface SharesService {
    isOwnVolume(volumeId: string): Promise<boolean>;
    getRootIDs(): Promise<{ volumeId: string }>;
}
