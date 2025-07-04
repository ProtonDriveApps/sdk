import { ProtonDriveEntitiesCache, Logger, ProtonDriveTelemetry } from "../../interface";
import { DriveAPIService } from "../apiService";
import { DriveListener } from "./interface";
import { EventsAPIService } from "./apiService";
import { EventsCache } from "./cache";
import { CoreEventManager } from "./coreEventManager";
import { VolumeEventManager } from "./volumeEventManager";

export type { DriveEvent, DriveListener } from "./interface";
export { DriveEventType } from "./interface";

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
    private logger: Logger;

    constructor(private telemetry: ProtonDriveTelemetry, apiService: DriveAPIService, driveEntitiesCache: ProtonDriveEntitiesCache) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('events');
        this.apiService = new EventsAPIService(apiService);
        this.cache = new EventsCache(driveEntitiesCache);

        // FIXME: Allow to pass own core events manager from the public interface.
        this.coreEvents = new CoreEventManager(this.logger, this.apiService, this.cache);
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
        this.sendNumberOfVolumeSubscriptionsToTelemetry();

        this.subscribedToRemoteDataUpdates = true;
        await this.coreEvents.startSubscription();
        await Promise.all(
            Object.values(this.volumesEvents)
                .map((volumeEvents) => volumeEvents.startSubscription())
        );
    }

    /**
     * Subscribe to given volume. The volume will be polled for events
     * with the polling interval depending on the type of the volume.
     * Own volumes are polled with highest frequency, while others are
     * polled with lower frequency depending on the total number of
     * subscriptions.
     * 
     * @param isOwnVolume - Owned volumes are polled with higher frequency.
     */
    async listenToVolume(volumeId: string, isOwnVolume = false): Promise<void> {
        await this.loadSubscribedVolumeEventServices();

        if (this.volumesEvents[volumeId]) {
            return;
        }
        this.logger.debug(`Creating volume event manager for volume ${volumeId}`);
        const manager = this.createVolumeEventManager(volumeId, isOwnVolume);

        // FIXME: Use dynamic algorithm to determine polling interval for non-own volumes.
        manager.setPollingInterval(isOwnVolume ? OWN_VOLUME_POLLING_INTERVAL : OTHER_VOLUME_POLLING_INTERVAL);
        if (this.subscribedToRemoteDataUpdates) {
            await manager.startSubscription();
            this.sendNumberOfVolumeSubscriptionsToTelemetry();
        }
    }

    private async loadSubscribedVolumeEventServices() {
        for (const volumeId of await this.cache.getSubscribedVolumeIds()) {
            if (!this.volumesEvents[volumeId]) {
                const isOwnVolume = await this.cache.isOwnVolume(volumeId) || false;
                this.createVolumeEventManager(volumeId, isOwnVolume);
            }
        }
    }

    private sendNumberOfVolumeSubscriptionsToTelemetry() {
        this.telemetry.logEvent({
            eventName: 'volumeEventsSubscriptionsChanged',
            numberOfVolumeSubscriptions: Object.keys(this.volumesEvents).length,
        });
    }

    private createVolumeEventManager(volumeId: string, isOwnVolume: boolean): VolumeEventManager {
        const manager = new VolumeEventManager(this.logger, this.apiService, this.cache, volumeId, isOwnVolume);
        for (const listener of this.listeners) {
            manager.addListener(listener);
        }
        this.volumesEvents[volumeId] = manager;
        return manager;
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
        // Add new listener to the list for any new event manager.
        this.listeners.push(callback);

        // Add new listener to all existings managers.
        this.coreEvents.addListener(callback);
        for (const volumeEvents of Object.values(this.volumesEvents)) {
            volumeEvents.addListener(callback);
        }
    }
}
