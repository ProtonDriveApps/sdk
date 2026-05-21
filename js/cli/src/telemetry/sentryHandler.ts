import {
    LogHandler,
    LogLevel,
    LogRecord,
    MetricEvent,
    MetricRecord,
} from '@protontech/drive-sdk/telemetry';

import { addBreadcrumb, SeverityLevel } from './sentry';

export class SentryLogHandler implements LogHandler {
    log(log: LogRecord) {
        const level = {
            [LogLevel.DEBUG]: 'debug',
            [LogLevel.INFO]: 'info',
            [LogLevel.WARNING]: 'warning',
            [LogLevel.ERROR]: 'error',
        }[log.level] as SeverityLevel;
        addBreadcrumb({
            message: log.message,
            level,
            category: log.loggerName,
            data: {
                error: log.error,
            },
        });
    }

    onEvent(metric: MetricRecord<MetricEvent>) {
        addBreadcrumb({
            message: metric.event.eventName,
            level: 'info',
            category: 'metric',
        });
    }
}
