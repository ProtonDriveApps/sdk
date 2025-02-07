import { Logger } from "../../interface";
import { DriveAPIService, drivePaths, corePaths } from "../apiService";
import { makeNodeUid } from "../uids";
import { DriveEvents, DriveEvent, DriveEventType } from "./interface";

type GetCoreLatestEventResponse = corePaths['/core/{_version}/events/latest']['get']['responses']['200']['content']['application/json'];
type GetCoreEventResponse = corePaths['/core/{_version}/events/{id}']['get']['responses']['200']['content']['application/json'];

type GetVolumeLatestEventResponse = drivePaths['/drive/volumes/{volumeID}/events/latest']['get']['responses']['200']['content']['application/json'];
type GetVokumeEventResponse = drivePaths['/drive/volumes/{volumeID}/events/{eventID}']['get']['responses']['200']['content']['application/json'];

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
        // TODO: Switch to v6 endpoint.
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

    async getVolumeEvents(volumeId: string, eventId: string): Promise<DriveEvents> {
        // TODO: Switch to the new API once it's available
        const result = await this.apiService.get<GetVokumeEventResponse>(`/drive/volumes/${volumeId}/events/${eventId}`);
        return {
            lastEventId: result.EventID,
            more: result.More === 1,
            refresh: result.Refresh === 1,
            events: result.Events.map((event) => {
                const type = VOLUME_EVENT_TYPE_MAP[event.EventType];
                const link = event.Link as Extract<GetVokumeEventResponse['Events'][0]['Link'], { ParentLinkID: unknown }>;
                const uids = {
                    nodeUid: makeNodeUid(volumeId, event.Link.LinkID),
                    parentNodeUid: makeNodeUid(volumeId, link.ParentLinkID as string),
                }
                if (type === DriveEventType.NodeDeleted) {
                    return {
                        type,
                        ...uids,
                    }
                }
                return {
                    type,
                    ...uids,
                    isTrashed: !!link.Trashed,
                    isShared: link.SharingDetails?.ShareID !== undefined,
                };
            }),
        };
    }
}
