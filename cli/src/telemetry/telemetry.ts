import {
    ConsoleLogHandler,
    LogFilter,
    LogHandler,
    MetricEvent,
    MetricHandler as MetricHandlerType,
    Telemetry,
} from '@protontech/drive-sdk/telemetry';

import { ApiClient } from '../api';
import { Config } from '../config';
import { ColoredConsoleMetricHandler } from './consoleHandler';
import { FileLogHandler } from './fileHandler';
import { ColoredLogFormatter } from './logFormatters';
import { CliMetrics, MetricHandler, UserPlan } from './metricHandler';
import { flushSentry } from './sentry';
import { SentryLogHandler } from './sentryHandler';

export function initTelemetry(config: Config) {
    const fileHandler = new FileLogHandler(config.logDir);
    const sentryHandler = new SentryLogHandler();
    const metricsHandler = config.enableMetrics ? new MetricHandler() : undefined;

    const logHandlers: LogHandler[] = [fileHandler, sentryHandler];
    if (config.enableConsoleLog) {
        logHandlers.push(new ConsoleLogHandler(new ColoredLogFormatter()));
    }

    const metricHandlers: MetricHandlerType<MetricEvent>[] = [fileHandler, sentryHandler];
    if (metricsHandler) {
        metricHandlers.push(metricsHandler);
    }
    if (config.enableConsoleLog) {
        metricHandlers.push(new ColoredConsoleMetricHandler());
    }

    const telemetry = new Telemetry({
        logFilter: new LogFilter({ globalLevel: config.logLevel }),
        logHandlers,
        metricHandlers,
    });

    return {
        telemetry,
        metrics: metricsHandler as CliMetrics,
        initMetrics: (apiClient: ApiClient, userPlan: UserPlan) => {
            metricsHandler?.init(apiClient, userPlan);
        },
        flush: async () => {
            await Promise.all([flushSentry(), metricsHandler?.flush()]);
        },
    };
}
