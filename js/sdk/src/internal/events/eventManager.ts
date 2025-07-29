import { Logger } from '../../interface';
import { EventManagerInterface, Event, EventSubscription } from './interface';

const FIBONACCI_LIST = [1, 1, 2, 3, 5, 8, 13];

type Listener<T> = (event: T) => Promise<void>;

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
 */
export class EventManager<T extends Event> {
    private logger: Logger;
    private latestEventId?: string;
    private timeoutHandle?: ReturnType<typeof setTimeout>;
    private processPromise?: Promise<void>;
    private listeners: Listener<T>[] = [];
    private retryIndex: number = 0;

    constructor(
        private specializedEventManager: EventManagerInterface<T>,
        private pollingIntervalInSeconds: number,
        latestEventId: string | null,
    ) {
        if (latestEventId !== null) {
            this.latestEventId = latestEventId;
        }
        this.logger = specializedEventManager.getLogger();
    }

    async start(): Promise<void> {
        if (this.latestEventId === undefined) {
            this.latestEventId = await this.specializedEventManager.getLatestEventId();
        }
        this.processPromise = this.processEvents();
    }

    addListener(callback: Listener<T>): EventSubscription {
        this.listeners.push(callback);
        return {
            dispose: (): void => {
                const index = this.listeners.indexOf(callback);
                this.listeners.splice(index, 1);
            },
        };
    }

    setPollingInterval(pollingIntervalInSeconds: number): void {
        this.pollingIntervalInSeconds = pollingIntervalInSeconds;
    }

    async stop(): Promise<void> {
        if (this.processPromise) {
            this.logger.info(`Stopping event manager`);
            try {
                await this.processPromise;
            } catch (error) {
                this.logger.warn(`Failed to stop cleanly: ${error instanceof Error ? error.message : error}`);
            }
        }

        if (!this.timeoutHandle) {
            return;
        }

        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = undefined;
    }

    private async notifyListeners(event: T): Promise<void> {
        for (const listener of this.listeners) {
            await listener(event);
        }
    }

    private async processEvents() {
        let listenerError;
        try {
            const events = this.specializedEventManager.getEvents(this.latestEventId!);
            for await (const event of events) {
                try {
                    await this.notifyListeners(event);
                } catch (internalListenerError) {
                    listenerError = internalListenerError;
                    break;
                }
                this.latestEventId = event.eventId;
            }
            this.retryIndex = 0;
        } catch (error: unknown) {
            // This could be improved to catch api specific errors and let the listener errors bubble up directly
            this.logger.error(
                `Failed to process events: ${error instanceof Error ? error.message : error} (retry ${this.retryIndex}, last event ID: ${this.latestEventId})`,
            );
            this.retryIndex++;
        }
        if (listenerError) {
            throw listenerError;
        }

        this.timeoutHandle = setTimeout(() => {
            this.processPromise = this.processEvents();
        }, this.nextPollTimeout);
    }

    /**
     * Polling timeout is using exponential backoff with Fibonacci sequence.
     */
    private get nextPollTimeout(): number {
        const retryIndex = Math.min(this.retryIndex, FIBONACCI_LIST.length - 1);
        // FIXME jitter
        return this.pollingIntervalInSeconds * 1000 * FIBONACCI_LIST[retryIndex];
    }
}
