import { DriveAPIService, drivePaths, corePaths } from '../apiService';
import { makeNodeUid } from '../uids';
import { DriveEventsListWithStatus, DriveEvent, DriveEventType, NodeEvent, NodeEventType } from './interface';

type GetCoreLatestEventResponse =
    corePaths['/core/{_version}/events/latest']['get']['responses']['200']['content']['application/json'];
type GetCoreEventResponse =
    corePaths['/core/{_version}/events/{id}']['get']['responses']['200']['content']['application/json'];

type GetVolumeLatestEventResponse =
    drivePaths['/drive/volumes/{volumeID}/events/latest']['get']['responses']['200']['content']['application/json'];
type GetVolumeEventResponse =
    drivePaths['/drive/v2/volumes/{volumeID}/events/{eventID}']['get']['responses']['200']['content']['application/json'];

interface VolumeEventTypeMap {
    [key: number]: NodeEventType;
}
const VOLUME_EVENT_TYPE_MAP: VolumeEventTypeMap = {
    0: DriveEventType.NodeDeleted,
    1: DriveEventType.NodeCreated,
    2: DriveEventType.NodeUpdated,
    3: DriveEventType.NodeUpdated,
};

/**
 * Provides API communication for fetching events.
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class EventsAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async getCoreLatestEventId(): Promise<string> {
        const result = await this.apiService.get<GetCoreLatestEventResponse>(`core/v4/events/latest`);
        return result.EventID as string;
    }

    async getCoreEvents(eventId: string): Promise<DriveEventsListWithStatus> {
        // TODO: Switch to v6 endpoint?
        const result = await this.apiService.get<GetCoreEventResponse>(`core/v5/events/${eventId}`);
        // in core/v5/events, refresh is always all apps, value 255
        const refresh = result.Refresh > 0;
        const events: DriveEvent[] =
            refresh || result.DriveShareRefresh?.Action === 2
                ? [
                      {
                          type: DriveEventType.SharedWithMeUpdated,
                          eventId: result.EventID,
                          treeEventScopeId: 'core',
                      },
                  ]
                : [];

        return {
            latestEventId: result.EventID,
            more: result.More === 1,
            refresh: result.Refresh === 1,
            events,
        };
    }

    async getVolumeLatestEventId(volumeId: string): Promise<string> {
        const result = await this.apiService.get<GetVolumeLatestEventResponse>(
            `drive/volumes/${volumeId}/events/latest`,
        );
        return result.EventID;
    }

    async getVolumeEvents(volumeId: string, eventId: string): Promise<DriveEventsListWithStatus> {
        const result = await this.apiService.get<GetVolumeEventResponse>(
            `drive/v2/volumes/${volumeId}/events/${eventId}`,
        );
        return {
            latestEventId: result.EventID,
            more: result.More,
            refresh: result.Refresh,
            events: result.Events.map((event): NodeEvent => {
                const type = VOLUME_EVENT_TYPE_MAP[event.EventType];
                const uids = {
                    nodeUid: makeNodeUid(volumeId, event.Link.LinkID),
                    parentNodeUid: makeNodeUid(volumeId, event.Link.ParentLinkID as string),
                };
                return {
                    type,
                    ...uids,
                    isTrashed: event.Link.IsTrashed,
                    isShared: event.Link.IsShared,
                    eventId: event.EventID,
                    treeEventScopeId: volumeId,
                };
            }),
        };
    }
}
