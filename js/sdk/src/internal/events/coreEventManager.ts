import { Logger } from '../../interface';
import { LoggerWithPrefix } from '../../telemetry';
import { EventsAPIService } from './apiService';
import { DriveEvent, DriveEventType, EventManagerInterface } from './interface';

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
export class CoreEventManager implements EventManagerInterface<DriveEvent> {
    constructor(
        private logger: Logger,
        private apiService: EventsAPIService,
    ) {
        this.apiService = apiService;

        this.logger = new LoggerWithPrefix(logger, `core`);
    }

    async getLatestEventId(): Promise<string> {
        return await this.apiService.getCoreLatestEventId();
    }

    async *getEvents(eventId: string): AsyncIterable<DriveEvent> {
        const events = await this.apiService.getCoreEvents(eventId);
        if (events.events.length === 0 && events.latestEventId !== eventId) {
            yield {
                type: DriveEventType.FastForward,
                treeEventScopeId: 'core',
                eventId: events.latestEventId,
            };
            return;
        }
        yield* events.events;
    }

    getLogger(): Logger {
        return this.logger;
    }
}
