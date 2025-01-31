import { DriveAPIService } from "../apiService/index.js";

export interface DriveEventsService {
    subscribeToRemoteDataUpdates: () => void,
    registerHandler: (callback: (event: DriveEvent) => Promise<void>) => void,
    lastUsedVolume: (volumeId: string) => void,
};

// TODO: implement event handling, generic for both core+volume events
export function events(apiService: DriveAPIService): DriveEventsService {
    return {
        // TODO: exposed to public, starts listening to core+volume events
        // TODO: core should listen only to minimum events possible
        // TODO: volume should listen: own always, others with limitations as per RFC
        subscribeToRemoteDataUpdates: () => {},

        // TODO: internal only, other modules can react to events
        // TODO: events module will wait for event to be processed - if its failing, it will not move forward
        registerHandler: (callback: (event: DriveEvent) => Promise<void>) => {},
        // TODO: helper that other modules can help say what volume is more important
        lastUsedVolume: (volumeId: string) => {},
    }
}

export type DriveEvent = {
    type: 'node_created' | 'node_updated' | 'node_updated_metadata',
    nodeUid: string,
    parentNodeUid: string,
    // TODO: needs RFC how we can pass it from events system efficiently without computing whole object
    isTrashed: boolean,
    isShared: boolean,
} | {
    type: 'node_deleted',
    nodeUid: string,
    parentNodeUid: string,
} | {
    type: 'share_with_me_updated',
}
