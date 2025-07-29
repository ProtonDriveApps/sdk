import { Logger, ProtonDriveTelemetry } from '../../interface';
import { DriveAPIService } from '../apiService';
import { DriveEvent, DriveListener, EventSubscription, LatestEventIdProvider } from './interface';
import { EventsAPIService } from './apiService';
import { CoreEventManager } from './coreEventManager';
import { VolumeEventManager } from './volumeEventManager';
import { EventManager } from './eventManager';
import { SharesManager } from '../shares/manager';

export type { DriveEvent, DriveListener } from './interface';
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
    private coreEvents?: EventManager<DriveEvent>;
    private volumeEventManagers: { [volumeId: string]: EventManager<DriveEvent> };
    private logger: Logger;

    constructor(
        private telemetry: ProtonDriveTelemetry,
        apiService: DriveAPIService,
        private shareManagement: SharesManager,
        private cacheEventListeners: DriveListener[] = [],
        private latestEventIdProvider?: LatestEventIdProvider,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('events');
        this.apiService = new EventsAPIService(apiService);
        this.volumeEventManagers = {};
    }

    /**
     * Subscribe to drive events. The treeEventScopeId can be obtained from a node.
     */
    async subscribeToTreeEvents(treeEventScopeId: string, callback: DriveListener): Promise<EventSubscription> {
        const volumeId = treeEventScopeId;
        this.logger.debug(`Creating volume event manager for volume ${volumeId}`);
        let manager = this.volumeEventManagers[volumeId];
        let started = true;
        if (manager === undefined) {
            manager = await this.createVolumeEventManager(volumeId);
            this.volumeEventManagers[volumeId] = manager;
            started = false;
            this.sendNumberOfVolumeSubscriptionsToTelemetry();
        }
        const eventSubscription = manager.addListener(callback);
        if (!started) {
            await manager.start();
        }
        return eventSubscription;
    }

    // FIXME: Allow to pass own core events manager from the public interface.
    async subscribeToCoreEvents(callback: DriveListener): Promise<EventSubscription> {
        if (this.latestEventIdProvider === null || this.latestEventIdProvider === undefined) {
            throw new Error(
                'Cannot subscribe to events without passing a latestEventIdProvider in ProtonDriveClient initialization',
            );
        }
        if (this.coreEvents === undefined) {
            const coreEventManager = new CoreEventManager(this.logger, this.apiService);
            const latestEventId = this.latestEventIdProvider.getLatestEventId('core') ?? null;
            this.coreEvents = new EventManager(coreEventManager, CORE_POLLING_INTERVAL, latestEventId);
            for (const listener of this.cacheEventListeners) {
                this.coreEvents.addListener(listener);
            }
        }
        const eventSubscription = this.coreEvents.addListener(callback);
        await this.coreEvents.start();
        return eventSubscription;
    }

    private sendNumberOfVolumeSubscriptionsToTelemetry() {
        this.telemetry.logEvent({
            eventName: 'volumeEventsSubscriptionsChanged',
            numberOfVolumeSubscriptions: Object.keys(this.volumeEventManagers).length,
        });
    }

    private async createVolumeEventManager(volumeId: string): Promise<EventManager<DriveEvent>> {
        if (this.latestEventIdProvider === null || this.latestEventIdProvider === undefined) {
            throw new Error(
                'Cannot subscribe to events without passing a latestEventIdProvider in ProtonDriveClient initialization',
            );
        }
        const isOwnVolume = await this.shareManagement.isOwnVolume(volumeId);
        const pollingInterval = this.getDefaultVolumePollingInterval(isOwnVolume);
        const volumeEventManager = new VolumeEventManager(this.logger, this.apiService, volumeId);
        const latestEventId = this.latestEventIdProvider.getLatestEventId(volumeId);
        const eventManager = new EventManager<DriveEvent>(volumeEventManager, pollingInterval, latestEventId);
        for (const listener of this.cacheEventListeners) {
            eventManager.addListener(listener);
        }
        await eventManager.start();
        this.volumeEventManagers[volumeId] = eventManager;
        return eventManager;
    }

    private getDefaultVolumePollingInterval(isOwnVolume: boolean): number {
        return isOwnVolume ? OWN_VOLUME_POLLING_INTERVAL : OTHER_VOLUME_POLLING_INTERVAL;
    }
}
