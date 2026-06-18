import { Logger, ProtonDriveTelemetry } from '../../interface';
import { DriveAPIService } from '../apiService';
import { CoreApiEvent, EventsAPIService } from './apiService';
import { CoreEventManager } from './coreEventManager';
import { EventManager } from './eventManager';
import { EventScheduler } from './eventScheduler';
import {
    DriveEvent,
    DriveEventType,
    DriveListener,
    EventSubscription,
    InternalDriveEvent,
    isInternalDriveEvent,
    LatestEventIdProvider,
    SharesService,
} from './interface';
import { VolumeEventManager } from './volumeEventManager';

export type { CoreApiEvent } from './apiService';
export type { EventScheduler } from './eventScheduler';
export type { DriveEvent, DriveListener, EventSubscription, InternalDriveEvent } from './interface';
export { isInternalDriveEvent } from './interface';
export { InternalEventType } from './interface';
export { DriveEventType } from './interface';

const OWN_VOLUME_POLLING_INTERVAL = 30;
const OTHER_VOLUME_POLLING_INTERVAL = 60;
const CORE_POLLING_INTERVAL = 30;

/**
 * Service for listening to drive events. The service is responsible for
 * managing the subscriptions to the events and notifying the listeners
 * about the new events.
 */
export class DriveEventsService {
    private apiService: EventsAPIService;
    private coreEventManager?: EventManager<DriveEvent | InternalDriveEvent>;
    private volumeEventManagers: { [volumeId: string]: EventManager<DriveEvent | InternalDriveEvent> };
    private logger: Logger;

    constructor(
        private telemetry: ProtonDriveTelemetry,
        apiService: DriveAPIService,
        private sharesService: SharesService,
        private cacheEventListeners: ((event: DriveEvent | InternalDriveEvent) => Promise<void>)[] = [],
        private latestEventIdProvider?: LatestEventIdProvider,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('events');
        this.apiService = new EventsAPIService(apiService);
        this.volumeEventManagers = {};
    }

    /**
     * @deprecated Use `processCoreEvent` instead.
     */
    async subscribeToCoreEvents(callback: DriveListener): Promise<EventSubscription> {
        let manager = this.coreEventManager;
        const started = !!manager;

        if (manager === undefined) {
            manager = await this.createCoreEventManager();
            this.coreEventManager = manager;
        }

        const eventSubscription = manager.addListener((event) => {
            if (isInternalDriveEvent(event)) {
                return Promise.resolve();
            }
            return callback(event);
        });
        if (!started) {
            await manager.start();
        }
        return eventSubscription;
    }

    private async createCoreEventManager() {
        if (!this.latestEventIdProvider) {
            throw new Error(
                'Cannot subscribe to events without passing a latestEventIdProvider in ProtonDriveClient initialization',
            );
        }

        const coreEventManager = new CoreEventManager(this.logger, this.apiService);
        const latestEventId = await this.latestEventIdProvider.getLatestEventId('core');
        const eventManager = new EventManager<DriveEvent | InternalDriveEvent>(
            coreEventManager,
            CORE_POLLING_INTERVAL,
            latestEventId,
        );

        for (const listener of this.cacheEventListeners) {
            eventManager.addListener(listener);
        }

        return eventManager;
    }

    /**
     * Process a raw core API event fetched by the caller's own event loop.
     * The SDK derives drive-relevant events from it, updates internal caches,
     * and notifies all listeners registered via `subscribeToPushedCoreEvents`.
     */
    async processCoreEvent(rawEvent: CoreApiEvent): Promise<DriveEvent[]> {
        const driveEvents = EventsAPIService.getDriveEventsFromCoreEvent(rawEvent);
        for (const event of driveEvents) {
            for (const listener of this.cacheEventListeners) {
                await listener(event);
            }
        }
        return driveEvents;
    }

    /**
     * Returns a scheduler that invokes the callback on a timer for each
     * registered tree event scope. Own volumes poll at the foreground rate;
     * shared volumes poll at the background rate unless promoted via
     * `setForeground`. Only one non-own volume can be in the foreground at
     * a time.
     */
    async getEventScheduler(callback: (eventTreeScopeId: string) => Promise<void>): Promise<EventScheduler> {
        const { volumeId: ownVolumeId } = await this.sharesService.getRootIDs();
        return new EventScheduler(callback, ownVolumeId);
    }

    /**
     * Provides drive events for a given tree scope. When no lastEventId is
     * provided, the latest event ID is fetched and a FastForward event is
     * yielded.
     */
    async *iterateEvents(
        treeEventScopeId: string,
        lastEventId?: string,
        signal?: AbortSignal,
    ): AsyncGenerator<DriveEvent> {
        const volumeId = treeEventScopeId;
        const volumeEventManager = new VolumeEventManager(this.logger, this.apiService, volumeId);
        if (!lastEventId) {
            lastEventId = await volumeEventManager.getLatestEventId();
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId,
                eventId: lastEventId,
            };
            return;
        }
        for await (const event of volumeEventManager.getEvents(lastEventId, signal)) {
            for (const listener of this.cacheEventListeners) {
                await listener(event);
            }
            if (!isInternalDriveEvent(event)) {
                yield event;
            }
        }
    }

    /**
     * Subscribe to drive events. The treeEventScopeId can be obtained from a node.
     *
     * @deprecated Use `iterateEvents` instead.
     */
    async subscribeToTreeEvents(treeEventScopeId: string, callback: DriveListener): Promise<EventSubscription> {
        const volumeId = treeEventScopeId;
        let manager = this.volumeEventManagers[volumeId];
        const started = !!manager;

        if (manager === undefined) {
            manager = await this.createVolumeEventManager(volumeId);
            this.volumeEventManagers[volumeId] = manager;
        }

        const filteredCallback = (event: DriveEvent | InternalDriveEvent) => {
            if (isInternalDriveEvent(event)) {
                return Promise.resolve();
            }
            return callback(event);
        };
        const eventSubscription = manager.addListener(filteredCallback);
        if (!started) {
            await manager.start();
            this.sendNumberOfVolumeSubscriptionsToTelemetry();
        }
        return eventSubscription;
    }

    private async createVolumeEventManager(volumeId: string): Promise<EventManager<DriveEvent | InternalDriveEvent>> {
        if (!this.latestEventIdProvider) {
            throw new Error(
                'Cannot subscribe to events without passing a latestEventIdProvider in ProtonDriveClient initialization',
            );
        }

        this.logger.debug(`Creating volume event manager for volume ${volumeId}`);
        const volumeEventManager = new VolumeEventManager(this.logger, this.apiService, volumeId);

        const isOwnVolume = await this.sharesService.isOwnVolume(volumeId);
        const pollingInterval = this.getDefaultVolumePollingInterval(isOwnVolume);
        const latestEventId = await this.latestEventIdProvider.getLatestEventId(volumeId);
        const eventManager = new EventManager<DriveEvent | InternalDriveEvent>(
            volumeEventManager,
            pollingInterval,
            latestEventId,
        );

        for (const listener of this.cacheEventListeners) {
            eventManager.addListener(listener);
        }

        return eventManager;
    }

    private getDefaultVolumePollingInterval(isOwnVolume: boolean): number {
        return isOwnVolume ? OWN_VOLUME_POLLING_INTERVAL : OTHER_VOLUME_POLLING_INTERVAL;
    }

    private sendNumberOfVolumeSubscriptionsToTelemetry() {
        this.telemetry.recordMetric({
            eventName: 'volumeEventsSubscriptionsChanged',
            numberOfVolumeSubscriptions: Object.keys(this.volumeEventManagers).length,
        });
    }
}
