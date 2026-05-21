import {
    MetricEvent,
    MetricHandler,
    MetricRecord,
} from '@protontech/drive-sdk/telemetry';

export class ColoredConsoleMetricHandler<T extends MetricEvent> implements MetricHandler<T> {
    onEvent(metric: MetricRecord<T>) {
        console.info(
            `\x1b[1;32m${metric.time.toISOString()} INFO [metric] ${metric.event.eventName} ${JSON.stringify({ ...metric.event, name: undefined })}\x1b[0m`,
        );
    }
}
