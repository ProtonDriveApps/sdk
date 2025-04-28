import { Logger } from "../../interface";
import { NotFoundAPIError } from "../apiService";
import { Events } from "./interface";

const DEFAULT_POLLING_INTERVAL_IN_SECONDS = 30;
const FIBONACCI_LIST = [1, 1, 2, 3, 5, 8, 13];

/**
 * `fullRefresh` is true when the event manager has requested a full
 * refresh of the data. That can happen if there is too many events
 * to be processed or the last event ID is too old.
 */
type Listener<T> = (events: T[], fullRefresh: boolean) => Promise<void>;

/**
 * Event manager general helper that is responsible for fetching events
 * from the server and notifying listeners about the events.
 * 
 * The specific implementation of fetching the events from the API must
 * be passed as dependency and can be used for any type of events that
 * supports the same structure.
 * 
 * The manager will not start fetching events until the `start` method is
 * called. Once started, the manager will fetch events in a loop with
 * a timeout between each fetch. The default timeout is 30 seconds and
 * additional jitter is used in case of failure.
 * 
 * Example of usage:
 * 
 * ```typescript
 * const manager = new EventManager(
 *    logger,
 *    () => apiService.getLatestEventId(),
 *    (eventId) => apiService.getEvents(eventId),
 * );
 * 
 * manager.addListener((events, fullRefresh) => {
 *   // Process the events
 * });
 * 
 * manager.start();
 * ```
 */
export class EventManager<T> {
    private latestEventId?: string;
    private timeoutHandle?: ReturnType<typeof setTimeout>;
    private processPromise?: Promise<void>;
    private listeners: Listener<T>[] = [];
    private retryIndex: number = 0;

    pollingIntervalInSeconds = DEFAULT_POLLING_INTERVAL_IN_SECONDS;

    constructor(
        private logger: Logger,
        private getLatestEventId: () => Promise<string>,
        private getEvents: (eventId: string) => Promise<Events<T>>,
        private updateLatestEventId: (lastEventId: string) => Promise<void>,
    ) {
        this.logger = logger;
        this.getLatestEventId = getLatestEventId;
        this.getEvents = getEvents;
        this.updateLatestEventId = updateLatestEventId;
    }

    addListener(callback: Listener<T>): void {
        this.listeners.push(callback);
    }

    async start(): Promise<void> {
        this.logger.info(`Starting event manager with polling interval ${this.pollingIntervalInSeconds} seconds`);
        await this.stop();
        this.processPromise = this.processEvents();
    }

    private async processEvents() {
        try {
            if (!this.latestEventId) {
                this.latestEventId = await this.getLatestEventId();
                await this.updateLatestEventId(this.latestEventId);
            } else {
                while (true) {
                    let result;
                    try {
                        result = await this.getEvents(this.latestEventId);
                    } catch (error: unknown) {
                        // If last event ID is not found, we need to refresh the data.
                        // Caller is notified via standard event update with refresh flag.
                        if (error instanceof NotFoundAPIError) {
                            this.logger.warn(`Last event ID not found, refreshing data`);
                            result = {
                                lastEventId: await this.getLatestEventId(), 
                                more: false, 
                                refresh: true,
                                events: [],
                            };
                        } else {
                            // Any other error is considered as a failure and we will retry
                            // with backoff policy.
                            throw error;
                        }
                    }
                    await this.notifyListeners(result);
                    if (result.lastEventId !== this.latestEventId) {
                        await this.updateLatestEventId(result.lastEventId);
                        this.latestEventId = result.lastEventId;
                    }
                    if (!result.more) {
                        break;
                    }
                }
            }
            this.retryIndex = 0;
        } catch (error: unknown) {
            this.logger.error(`Failed to process events: ${error instanceof Error ? error.message : error} (retry ${this.retryIndex}, last event ID: ${this.latestEventId})`);
            this.retryIndex++;
        }

        this.timeoutHandle = setTimeout(() => {
            this.processPromise = this.processEvents();
        }, this.nextPollTimeout);
    };

    private async notifyListeners(result: Events<T>): Promise<void> {
        if (result.events.length === 0 && !result.refresh) {
            return;
        }
        if (!this.listeners.length) {
            return;
        }

        this.logger.debug(`Notifying listeners about ${result.events.length} events`);

        for (const listener of this.listeners) {
            try {
                await listener(result.events, result.refresh);
            } catch (error: unknown) {
                this.logger.error(`Failed to process events: ${error instanceof Error ? error.message : error} (last event ID: ${result.lastEventId}, refresh: ${result.refresh})`);
                throw error;
            }
        }
    }

    /**
     * Polling timeout is using exponential backoff with Fibonacci sequence.
     * 
     * The timeout is public for testing purposes only.
     */
    get nextPollTimeout(): number {
        const retryIndex = Math.min(this.retryIndex, FIBONACCI_LIST.length - 1);
        return this.pollingIntervalInSeconds * 1000 * FIBONACCI_LIST[retryIndex];
    }

    async stop(): Promise<void> {
        if (this.processPromise) {
            this.logger.info(`Stopping event manager`);
            try {
                await this.processPromise;
            } catch {}
        }

        if (!this.timeoutHandle) {
            return;
        }

        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = undefined;
    }
}
