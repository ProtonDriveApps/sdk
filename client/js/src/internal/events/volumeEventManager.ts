import { Logger } from '../../interface';
import { LoggerWithPrefix } from '../../telemetry';
import { NotFoundAPIError } from '../apiService';
import { makeNodeUid } from '../uids';
import { EventsAPIService } from './apiService';
import {
    DriveEvent,
    DriveEventsListWithStatus,
    DriveEventType,
    EventManagerInterface,
    InternalDriveEvent,
    InternalEventType,
    UnsubscribeFromEventsSourceError,
} from './interface';

/**
 * Combines API and event manager to provide a service for listening to
 * volume events. Volume events are all about nodes updates. Whenever
 * there is update to the node metadata or content, the event is emitted.
 */
export class VolumeEventManager implements EventManagerInterface<DriveEvent | InternalDriveEvent> {
    constructor(
        private logger: Logger,
        private apiService: EventsAPIService,
        private volumeId: string,
    ) {
        this.apiService = apiService;
        this.volumeId = volumeId;
        this.logger = new LoggerWithPrefix(logger, `volume ${volumeId}`);
    }

    getLogger(): Logger {
        return this.logger;
    }

    async *getEvents(eventId: string, signal?: AbortSignal): AsyncIterable<DriveEvent | InternalDriveEvent> {
        try {
            let events: DriveEventsListWithStatus;
            let more = true;
            while (more) {
                events = await this.apiService.getVolumeEvents(this.volumeId, eventId, signal);
                more = events.more;
                if (events.convertibleExternalInvitationLinkIds.length > 0) {
                    const nodeUids = events.convertibleExternalInvitationLinkIds.map((linkId) =>
                        makeNodeUid(this.volumeId, linkId),
                    );
                    yield {
                        type: InternalEventType.ConvertibleExternalInvitations,
                        treeEventScopeId: this.volumeId,
                        eventId: events.latestEventId,
                        nodeUids,
                    };
                }
                if (events.refresh) {
                    yield {
                        type: DriveEventType.TreeRefresh,
                        treeEventScopeId: this.volumeId,
                        eventId: events.latestEventId,
                    };
                    break;
                }
                // Update to the latest eventId to avoid inactive volumes from getting out of sync
                if (events.events.length === 0 && events.latestEventId !== eventId) {
                    yield {
                        type: DriveEventType.FastForward,
                        treeEventScopeId: this.volumeId,
                        eventId: events.latestEventId,
                    };
                    break;
                }
                yield* events.events;
                eventId = events.latestEventId;
            }
        } catch (error: unknown) {
            if (error instanceof NotFoundAPIError) {
                this.logger.info(`Volume events no longer accessible`);
                yield {
                    type: DriveEventType.TreeRemove,
                    treeEventScopeId: this.volumeId,
                    // After a TreeRemoval event, polling should stop.
                    eventId: 'none',
                };
            }
            throw error;
        }
    }

    async getLatestEventId(): Promise<string> {
        try {
            return await this.apiService.getVolumeLatestEventId(this.volumeId);
        } catch (error: unknown) {
            if (error instanceof NotFoundAPIError) {
                this.logger.info(`Volume events no longer accessible`);
                throw new UnsubscribeFromEventsSourceError(error.message);
            }
            throw error;
        }
    }
}
