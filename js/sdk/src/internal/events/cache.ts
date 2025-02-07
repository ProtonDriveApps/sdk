import { ProtonDriveEntitiesCache } from "../../interface";

type CachedEventsData = {
    // Key is either a volume ID for volume events or 'core' for core events.
    [key: string]: {
        lastEventId: string;
        pollingIntervalInSeconds: number;
    }
};

/**
 * Provides caching for events IDs.
 */
export class EventsCache {
    /**
     * Locally cached events data to avoid unnecessary reads from the cache.
     * Data about last event ID or interval might be accessed often by events
     * managers.
     */
    private events?: CachedEventsData;

    constructor(private driveCache: ProtonDriveEntitiesCache) {
        this.driveCache = driveCache;
    }

    async setLastEventId(volumeIdOrCore: string, lastEventId: string, pollingIntervalInSeconds: number): Promise<void> {
        const events = await this.getEvents();
        events[volumeIdOrCore] = {
            lastEventId,
            pollingIntervalInSeconds,
        }
        await this.cacheEvents(events);
    }

    async getLastEventId(volumeIdOrCore: string): Promise<string | undefined> {
        const events = await this.getEvents();
        if (events[volumeIdOrCore]) {
            return events[volumeIdOrCore].lastEventId;
        }
    }

    async getPollingIntervalInSeconds(volumeIdOrCore: string): Promise<number | undefined> {
        const events = await this.getEvents();
        if (events[volumeIdOrCore]) {
            return events[volumeIdOrCore].pollingIntervalInSeconds;
        }
    }

    async getSubscribedVolumeIds(): Promise<string[]> {
        const events = await this.getEvents();
        return Object.keys(events).filter((volumeIdOrCore) => volumeIdOrCore !== 'core');
    }

    private async getEvents(): Promise<CachedEventsData> {
        if (!this.events) {
            this.events = await this.getCachedEvents();
        }
        return this.events;
    }

    private async getCachedEvents(): Promise<CachedEventsData> {
        try {
            const events = await this.driveCache.getEntity('events');
            return JSON.parse(events);
        } catch {};
        return {};
    }

    private async cacheEvents(events: CachedEventsData): Promise<void> {
        this.events = events;
        await this.driveCache.setEntity('events', JSON.stringify(events));
    }
}
