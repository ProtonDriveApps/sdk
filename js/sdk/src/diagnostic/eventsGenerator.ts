import { DiagnosticResult } from './interface';

/**
 * A base class for class that should provide diagnostic events
 * as a separate generator. Simply inherit from this class and use
 * `enqueueEvent` to enqueue the observed events. The events will be
 * available via `iterateEvents` generator.
 */
export class EventsGenerator {
    private eventQueue: DiagnosticResult[] = [];
    private waitingResolvers: Array<() => void> = [];

    protected enqueueEvent(event: DiagnosticResult): void {
        this.eventQueue.push(event);
        // Notify all waiting generators
        const resolvers = this.waitingResolvers.splice(0);
        resolvers.forEach(resolve => resolve());
    }

    async* iterateEvents(): AsyncGenerator<DiagnosticResult> {
        try {
            while (true) {
                if (this.eventQueue.length === 0) {
                    await this.waitForEvent();
                }

                while (this.eventQueue.length > 0) {
                    const event = this.eventQueue.shift();
                    if (event) {
                        yield event;
                    }
                }
            }
        } finally {
            this.waitingResolvers.splice(0);
        }
    }

    private waitForEvent(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.eventQueue.length > 0) {
                resolve();
            } else {
                this.waitingResolvers.push(resolve);
            }
        });
    }
}
