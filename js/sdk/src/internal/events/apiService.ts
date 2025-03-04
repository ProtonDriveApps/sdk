import { Logger } from "../../interface";
import { DriveAPIService, drivePaths, corePaths } from "../apiService";
import { makeNodeUid } from "../uids";
import { DriveEvents, DriveEvent, DriveEventType } from "./interface";

type GetCoreLatestEventResponse = corePaths['/core/{_version}/events/latest']['get']['responses']['200']['content']['application/json'];
type GetCoreEventResponse = corePaths['/core/{_version}/events/{id}']['get']['responses']['200']['content']['application/json'];

type GetVolumeLatestEventResponse = drivePaths['/drive/volumes/{volumeID}/events/latest']['get']['responses']['200']['content']['application/json'];
type GetVokumeEventResponse = drivePaths['/drive/v2/volumes/{volumeID}/events/{eventID}']['get']['responses']['200']['content']['application/json'];

const VOLUME_EVENT_TYPE_MAP = {
    0: DriveEventType.NodeDeleted,
    1: DriveEventType.NodeCreated,
    2: DriveEventType.NodeUpdated,
    3: DriveEventType.NodeUpdatedMetadata,
}

/**
 * Provides API communication for fetching events.
 * 
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class EventsAPIService {
    constructor(private apiService: DriveAPIService, private logger?: Logger) {
        this.apiService = apiService;
        this.logger = logger;
    }

    async getCoreLatestEventId(): Promise<string> {
        const result = await this.apiService.get<GetCoreLatestEventResponse>(`/core/v5/events/latest`);
        return result.EventID as string;
    }

    async getCoreEvents(eventId: string): Promise<DriveEvents> {
        // TODO: Switch to v6 endpoint: DriveShareRefresh doesnt seem to be part of it.
        const result = await this.apiService.get<GetCoreEventResponse>(`/core/v5/events/${eventId}?NoMetaData=1`);
        const events: DriveEvent[] = result.DriveShareRefresh?.Action === 2 ? [
            {
                type: DriveEventType.ShareWithMeUpdated,
            }
        ] : [];

        return {
            lastEventId: result.EventID,
            more: result.More === 1,
            refresh: result.Refresh === 1,
            events,
        };
    }

    async getVolumeLatestEventId(volumeId: string): Promise<string> {
        const result = await this.apiService.get<GetVolumeLatestEventResponse>(`/drive/volumes/${volumeId}/events/latest`);
        return result.EventID;
    }

    async getVolumeEvents(volumeId: string, eventId: string, isOwnVolume = false): Promise<DriveEvents> {
        const result = await this.apiService.get<GetVokumeEventResponse>(`/drive/v2/volumes/${volumeId}/events/${eventId}`);
        return {
            lastEventId: result.EventID,
            more: result.More,
            refresh: result.Refresh,
            events: result.Events.map((event): DriveEvent => {
                const type = VOLUME_EVENT_TYPE_MAP[event.EventType];
                const uids = {
                    nodeUid: makeNodeUid(volumeId, event.Link.LinkID),
                    parentNodeUid: makeNodeUid(volumeId, event.Link.ParentLinkID as string),
                }
                // VOLUME_EVENT_TYPE_MAP will never return this event type.
                // It is here to satisfy the type checker. It is safe to do.
                if (type === DriveEventType.ShareWithMeUpdated) {
                    return {
                        type,
                    };
                }
                return {
                    type,
                    ...uids,
                    isTrashed: event.Link.IsTrashed,
                    isShared: event.Link.IsShared,
                    isOwnVolume,
                };
            }),
        };
    }
}
