import { Logger, ProtonDriveTelemetry } from '../../interface';
import { DriveAPIService } from '../apiService';
import { DriveEvent, DriveListener, EventSubscription, LatestEventIdProvider, SharesService } from './interface';
import { EventsAPIService } from './apiService';
import { CoreEventManager } from './coreEventManager';
import { VolumeEventManager } from './volumeEventManager';
import { EventManager } from './eventManager';

export type { DriveEvent, DriveListener, EventSubscription } from './interface';
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
    private coreEventManager?: EventManager<DriveEvent>;
    private volumeEventManagers: { [volumeId: string]: EventManager<DriveEvent> };
    private logger: Logger;

    constructor(
        private telemetry: ProtonDriveTelemetry,
        apiService: DriveAPIService,
        private sharesService: SharesService,
        private cacheEventListeners: DriveListener[] = [],
        private latestEventIdProvider?: LatestEventIdProvider,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('events');
        this.apiService = new EventsAPIService(apiService);
        this.volumeEventManagers = {};
    }

    // FIXME: Allow to pass own core events manager from the public interface.
    async subscribeToCoreEvents(callback: DriveListener): Promise<EventSubscription> {
        let manager = this.coreEventManager;
        const started = !!manager;

        if (manager === undefined) {
            manager = await this.createCoreEventManager();
            this.coreEventManager = manager;
        }

        const eventSubscription = manager.addListener(callback);
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
        const latestEventId = this.latestEventIdProvider.getLatestEventId('core') ?? null;
        const eventManager = new EventManager(coreEventManager, CORE_POLLING_INTERVAL, latestEventId);

        for (const listener of this.cacheEventListeners) {
            eventManager.addListener(listener);
        }

        return eventManager;
    }

    /**
     * Subscribe to drive events. The treeEventScopeId can be obtained from a node.
     */
    async subscribeToTreeEvents(treeEventScopeId: string, callback: DriveListener): Promise<EventSubscription> {
        const volumeId = treeEventScopeId;
        let manager = this.volumeEventManagers[volumeId];
        const started = !!manager;

        if (manager === undefined) {
            manager = await this.createVolumeEventManager(volumeId);
            this.volumeEventManagers[volumeId] = manager;
        }

        const eventSubscription = manager.addListener(callback);
        if (!started) {
            await manager.start();
            this.sendNumberOfVolumeSubscriptionsToTelemetry();
        }
        return eventSubscription;
    }

    private async createVolumeEventManager(volumeId: string): Promise<EventManager<DriveEvent>> {
        if (!this.latestEventIdProvider) {
            throw new Error(
                'Cannot subscribe to events without passing a latestEventIdProvider in ProtonDriveClient initialization',
            );
        }

        this.logger.debug(`Creating volume event manager for volume ${volumeId}`);
        const volumeEventManager = new VolumeEventManager(this.logger, this.apiService, volumeId);

        const isOwnVolume = await this.sharesService.isOwnVolume(volumeId);
        const pollingInterval = this.getDefaultVolumePollingInterval(isOwnVolume);
        const latestEventId = this.latestEventIdProvider.getLatestEventId(volumeId);
        const eventManager = new EventManager<DriveEvent>(volumeEventManager, pollingInterval, latestEventId);

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
