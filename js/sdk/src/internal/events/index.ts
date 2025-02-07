import { ProtonDriveEntitiesCache, Logger } from "../../interface";
import { DriveAPIService } from "../apiService";
import { DriveListener } from "./interface";
import { EventsAPIService } from "./apiService";
import { EventsCache } from "./cache";
import { CoreEventManager } from "./coreEventManager";
import { VolumeEventManager } from "./volumeEventManager";

export { DriveEvent, DriveEventType } from "./interface";

const OWN_VOLUME_POLLING_INTERVAL = 30;
const OTHER_VOLUME_POLLING_INTERVAL = 60;

/**
 * Service for listening to drive events. The service is responsible for
 * managing the subscriptions to the events and notifying the listeners
 * about the new events.
 */
export class DriveEventsService {
    private apiService: EventsAPIService;
    private cache: EventsCache;
    private subscribedToRemoteDataUpdates: boolean = false;
    private listeners: DriveListener[] = [];
    private coreEvents: CoreEventManager;
    private volumesEvents: { [volumeId: string]: VolumeEventManager };

    constructor(apiService: DriveAPIService, driveEntitiesCache: ProtonDriveEntitiesCache, private log?: Logger) {
        this.apiService = new EventsAPIService(apiService);
        this.cache = new EventsCache(driveEntitiesCache);
        this.log = log;

        // TODO: Allow to pass own core events manager from the public interface.
        this.coreEvents = new CoreEventManager(this.apiService, this.cache, this.log);
        this.volumesEvents = {};
    }

    /**
     * Loads all the subscribed volumes (including core events) from the
     * cache and starts listening to their events. Any additional volume
     * that is subscribed to later will be automatically started.
     */
    async subscribeToRemoteDataUpdates(): Promise<void> {
        if (this.subscribedToRemoteDataUpdates) {
            return;
        }

        await this.loadSubscribedVolumeEventServices();

        this.subscribedToRemoteDataUpdates = true;
        this.coreEvents.startSubscription();
        Object.values(this.volumesEvents).forEach((volumeEvents) => volumeEvents.startSubscription());
    }

    /**
     * Subscribe to given volume. The volume will be polled for events
     * with the polling interval depending on the type of the volume.
     * Own volumes are polled with highest frequency, while others are
     * polled with lower frequency depending on the total number of
     * subsciptions.
     * 
     * @param isOwnVolume - Owned volumes are polled with higher frequency.
     */
    async listenToVolume(volumeId: string, isOwnVolume = false): Promise<void> {
        await this.loadSubscribedVolumeEventServices();

        if (this.volumesEvents[volumeId]) {
            return;
        }
        const volumeEvents = new VolumeEventManager(this.apiService, this.cache, volumeId, this.log);
        this.volumesEvents[volumeId] = volumeEvents;

        // TODO: Use dynamic algorithm to determine polling interval for non-own volumes.
        volumeEvents.setPollingInterval(isOwnVolume ? OWN_VOLUME_POLLING_INTERVAL : OTHER_VOLUME_POLLING_INTERVAL);
        if (this.subscribedToRemoteDataUpdates) {
            volumeEvents.startSubscription();
        }
    }

    private async loadSubscribedVolumeEventServices() {
        for (const volumeId of await this.cache.getSubscribedVolumeIds()) {
            if (!this.volumesEvents[volumeId]) {
                this.volumesEvents[volumeId] = new VolumeEventManager(this.apiService, this.cache, volumeId, this.log);
            }
        }
    }

    /**
     * Listen to the drive events. The listener will be called with the
     * new events as they arrive.
     * 
     * One call always provides events from withing the same volume. The
     * second argument of the callback `fullRefreshVolumeId` is thus single
     * ID and if multiple volumes must be fully refreshed, client will
     * receive multiple calls.
     */
    addListener(callback: DriveListener): void {
        this.listeners.push(callback);
    }
}
