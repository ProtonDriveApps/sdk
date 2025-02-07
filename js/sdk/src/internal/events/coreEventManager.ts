import { Logger } from "../../interface";
import { EventsAPIService } from "./apiService";
import { EventsCache } from "./cache";
import { DriveEvent, DriveEventType } from "./interface";
import { EventManager } from "./eventManager";

/**
 * Combines API and event manager to provide a service for listening to
 * core events. Core events are events that are not specific to any volume.
 * At this moment, Drive listenes only to shares with me updates from core
 * events. Such even indicates that user was invited to the new share or
 * that user's membership was removed from existing one and lost access.
 * 
 * The client might be already using own core events, thus this service
 * is here only in case the client is not connected to the Proton services
 * with own implementation.
 */
export class CoreEventManager {
    private manager: EventManager<DriveEvent>;

    constructor(private apiService: EventsAPIService, private cache: EventsCache, log?: Logger) {
        this.apiService = apiService;

        this.manager = new EventManager(
            () => this.getLastEventId(),
            (eventId) => this.apiService.getCoreEvents(eventId),
            (lastEventId) => this.cache.setLastEventId('core', lastEventId, this.manager.pollingIntervalInSeconds),
            log,
        );
    }

    private async getLastEventId(): Promise<string> {
        const lastEventId = await this.cache.getLastEventId('core');
        if (lastEventId) {
            return lastEventId;
        }
        return this.apiService.getCoreLatestEventId();
    }

    startSubscription(): void {
        this.manager.start();
    }

    stopSubscription(): void {
        this.manager.stop();
    }

    addListener(callback: (events: DriveEvent[]) => Promise<void>): void {
        this.manager.addListener(async (events, fullRefresh) => {
            if (events) {
                await callback(events);
            }
            if (fullRefresh) {
                // Because only updates about shares that are shared with me
                // are listened to from core events, in the case of core full
                // refresh, we don't have to refresh anything more than this
                // one specific event.
                await callback([{
                    type: DriveEventType.ShareWithMeUpdated,
                }]);
            }
        });
    }
}
