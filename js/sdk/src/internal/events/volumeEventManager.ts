import { Logger } from "../../interface";
import { LoggerWithPrefix } from "../../telemetry";
import { EventsAPIService } from "./apiService";
import { EventsCache } from "./cache";
import { DriveEvent, DriveListener } from "./interface";
import { EventManager } from "./eventManager";

/**
 * Combines API and event manager to provide a service for listening to
 * volume events. Volume events are all about nodes updates. Whenever
 * there is update to the node metadata or content, the event is emitted.
 */
export class VolumeEventManager {
    private manager: EventManager<DriveEvent>;

    constructor(logger: Logger, private apiService: EventsAPIService, private cache: EventsCache, private volumeId: string, isOwnVolume: boolean) {
        this.apiService = apiService;
        this.volumeId = volumeId;

        this.manager = new EventManager(
            new LoggerWithPrefix(logger, `volume ${volumeId}`),
            () => this.getLastEventId(),
            (eventId) => this.apiService.getVolumeEvents(volumeId, eventId, isOwnVolume),
            (lastEventId) => this.cache.setLastEventId(volumeId, {
                lastEventId,
                pollingIntervalInSeconds: this.manager.pollingIntervalInSeconds,
                isOwnVolume
            }),
        );
        this.cache.getPollingIntervalInSeconds(volumeId)
            .then((pollingIntervalInSeconds) => {
                if (pollingIntervalInSeconds) {
                    this.manager.pollingIntervalInSeconds = pollingIntervalInSeconds;
                }
            })
            .catch(() => {});
    }

    private async getLastEventId(): Promise<string> {
        const lastEventId = await this.cache.getLastEventId(this.volumeId);
        if (lastEventId) {
            return lastEventId;
        }
        return this.apiService.getVolumeLatestEventId(this.volumeId);
    }

    /**
     * There is a limit how many volume subscribtions can be active at
     * the same time. The manager of all volume managers should set the
     * intervals for each volume accordingly depending on the volume
     * type or the total number of subscriptions.
     */
    setPollingInterval(pollingIntervalInSeconds: number): void {
        this.manager.pollingIntervalInSeconds = pollingIntervalInSeconds;
    }

    async startSubscription(): Promise<void> {
        await this.manager.start();
    }

    async stopSubscription(): Promise<void> {
        await this.manager.stop();
    }

    addListener(callback: DriveListener): void {
        this.manager.addListener(async (events, fullRefresh) => {
            if (fullRefresh) {
                await callback([], this.volumeId);
            } else {
                await callback(events);
            }
        });
    }
}
