import { ProtonDriveTelemetry, Logger, SDKEvent } from "../interface";

export class SDKEvents {
    private logger: Logger;
    private listeners: Map<SDKEvent, (() => void)[]> = new Map();

    constructor(telemetry: ProtonDriveTelemetry) {
        this.logger = telemetry.getLogger('sdk-events');
    }

    addListener(eventName: SDKEvent, callback: () => void): () => void {
        this.listeners.set(eventName, [
            ...(this.listeners.get(eventName) || []),
            callback,
        ]);

        return () => {
            this.listeners.set(
                eventName,
                this.listeners.get(eventName)?.filter((cb) => cb !== callback) || []
            );
        }
    }

    transfersPaused(): void {
        this.emit(SDKEvent.TransfersPaused);
    }

    transfersResumed(): void {
        this.emit(SDKEvent.TransfersResumed);
    }

    requestsThrottled(): void {
        this.emit(SDKEvent.RequestsThrottled);
    }

    requestsUnthrottled(): void {
        this.emit(SDKEvent.RequestsUnthrottled);
    }

    private emit(eventName: SDKEvent): void {
        if (!this.listeners.get(eventName)?.length) {
            this.logger.debug(`No listeners for event: ${eventName}`);
            return;
        }

        this.logger.debug(`Emitting event: ${eventName}`);
        this.listeners
            .get(eventName)
            ?.forEach((callback) => callback());
    }
}
