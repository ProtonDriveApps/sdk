import { MetricEvent } from '../interface';
import { LogRecord, LogLevel } from '../telemetry';
import { EventsGenerator } from './eventsGenerator';

/**
 * Special telemetry that is compatible with the SDK.
 *
 * It is a probe into SDK to observe whats going on and report any suspicious
 * behavior.
 *
 * It should be used only for diagnostic purposes.
 */
export class DiagnosticTelemetry extends EventsGenerator {
    getLogger(name: string): Logger {
        return new Logger(name, (log) => {
            this.enqueueEvent({
                type: log.level === LogLevel.ERROR ? 'log_error' : 'log_warning',
                log,
            });
        });
    }

    recordMetric(event: MetricEvent): void {
        if (event.eventName === 'download' && !event.error) {
            return;
        }
        if (event.eventName === 'volumeEventsSubscriptionsChanged') {
            return;
        }

        this.enqueueEvent({
            type: 'metric',
            event,
        });
    }
}

class Logger {
    constructor(
        private name: string,
        private callback?: (log: LogRecord) => void,
    ) {
        this.name = name;
        this.callback = callback;
    }

    // Debug or info logs are excluded from the diagnostic.
    // These logs should not include any suspicious behavior.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    debug(message: string) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info(message: string) {}

    warn(message: string) {
        this.callback?.({
            time: new Date(),
            level: LogLevel.WARNING,
            loggerName: this.name,
            message,
        });
    }

    error(message: string, error?: unknown) {
        this.callback?.({
            time: new Date(),
            level: LogLevel.ERROR,
            loggerName: this.name,
            message,
            error,
        });
    }
}
