import { Logger as LoggerInterface } from './interface';

export interface LogRecord {
    time: Date,
    level: LogLevel;
    loggerName: string;
    message: string;
    error?: unknown;
}

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

export interface LogFormatter {
    format(log: LogRecord): string;
}

export interface LogHandler {
    log(log: LogRecord): void;
}

export interface MetricRecord<T extends MetricEvent> {
    time: Date,
    event: T;
}

export type MetricEvent = {
    eventName: string;
}

export interface MetricHandler<T extends MetricEvent> {
    onEvent(metric: MetricRecord<T>): void;
}

/**
 * Telemetry class that logs messages and metrics.
 * 
 * Example:
 * 
 * ```typescript
 * const memoryLogHandler = new MemoryLogHandler();
 * 
 * interface MetricEvents = {
 *    name: string,
 *    value: number,
 * }
 * class OwnMetricHandler implements MetricHandler<MetricEvents> {
 *    onEvent(metric: MetricRecord<MetricEvents>) {
 *        // Process metric event
 *    }
 * }
 * 
 * const telemetry = new Telemetry<MetricEvents>({
 *    // Enable debug logging
 *    logFilter: new LogFilter({ level: LogLevel.DEBUG }),
 *    // Log to console and memory
 *    logHandlers: [new ConsoleLogHandler(), memoryLogHandler],
 *    // Log to console and own handler to process further
 *    metricHandlers: [new ConsoleMetricHandler(), ownMetricHandler],
 * });
 * 
 * const logger = telemetry.getLogger('myLogger');
 * logger.debug('Debug message');
 * 
 * telemetry.logEvent({ name: 'somethingHappened', value: 42 });
 * 
 * const logs = memoryLogHandler.getLogs();
 * // Process logs
 * ```
 * 
 * @param logFilter - Log filter to filter logs based on log level, default INFO
 * @param logHandlers - Log handlers to use for logging, see LogHandler implementations
 * @param metricHandlers - Metric handlers to use for logging, see MetricHandler implementations
 */
export class Telemetry<T extends MetricEvent> {
    private logFilter: LogFilter;
    private logHandlers: LogHandler[];
    private metricHandlers: MetricHandler<T>[];

    constructor(
        options?: {
            logFilter?: LogFilter,
            logHandlers?: LogHandler[],
            metricHandlers?: MetricHandler<T>[],
        }
    ) {
        this.logFilter = options?.logFilter || new LogFilter();
        this.logHandlers = options?.logHandlers || [new ConsoleLogHandler()];
        this.metricHandlers = options?.metricHandlers || [new ConsoleMetricHandler()];
    }

    getLogger(name: string): Logger {
        return new Logger(name, this.logFilter, this.logHandlers);
    }

    logEvent(event: T): void {
        const metric = {
            time: new Date(),
            event,
        };
        this.metricHandlers.forEach(handler => handler.onEvent(metric));
    }
}

/**
 * Logger class that logs messages with different levels.
 * 
 * @param name - Name of the logger
 * @param handlers - Log handlers to use for logging, see LogHandler implementations
 */
class Logger {
    constructor(private name: string, private filter: LogFilter, private handlers: LogHandler[]) {
        this.name = name;
        this.filter = filter;
        this.handlers = handlers;
    }

    debug(message: string) {
        this.log({
            time: new Date(),
            level: LogLevel.DEBUG,
            loggerName: this.name,
            message,
        });
    }

    info(message: string) {
        this.log({
            time: new Date(),
            level: LogLevel.INFO,
            loggerName: this.name,
            message,
        });
    }

    warn(message: string) {
        this.log({
            time: new Date(),
            level: LogLevel.WARNING,
            loggerName: this.name,
            message,
        });
    }

    error(message: string, error?: unknown) {
        this.log({
            time: new Date(),
            level: LogLevel.ERROR,
            loggerName: this.name,
            message,
            error,
        });
    }

    private log(log: LogRecord) {
        if (!this.filter.filter(log)) {
            return;
        }
        this.handlers.forEach(handler => handler.log(log));
    }
}

/**
 * Logger class that logs messages with a prefix.
 * 
 * Example:
 * 
 * ```typescript
 * const logger = new Logger('myLogger', new LogFilter(), [new ConsoleLogHandler()]);
 * const loggerWithPrefix = new LoggerWithPrefix(logger, 'prefix');
 * loggerWithPrefix.info('Info message');
 * ```
 */
export class LoggerWithPrefix {
    constructor(private logger: LoggerInterface, private prefix: string) {
        this.logger = logger;
        this.prefix = prefix;
    }

    info(message: string) {
        this.logger.info(`${this.prefix}: ${message}`);
    }

    debug(message: string) {
        this.logger.debug(`${this.prefix}: ${message}`);
    }

    warn(message: string) {
        this.logger.warn(`${this.prefix}: ${message}`);
    }

    error(message: string, error?: unknown) {
        this.logger.error(`${this.prefix}: ${message}`, error);
    }
}

/**
 * Filter logs based on log level. It can be configured by global level or
 * per logger level.
 * 
 * @param globalLevel - Global log level, default INFO
 * @param loggerLevels - Log levels for specific loggers, default empty
 */
export class LogFilter {
    private logLevelMap = {
        'DEBUG': 0,
        'INFO': 1,
        'WARNING': 2,
        'ERROR': 3,
    }

    private globalLevel: number;
    private loggerLevels: { [loggerName: string]: number };

    constructor(options?: {
        globalLevel?: LogLevel,
        loggerLevels?: { [loggerName: string]: LogLevel },
    }) {
        this.globalLevel = this.logLevelMap[options?.globalLevel || LogLevel.INFO];
        this.loggerLevels = Object.fromEntries(Object.entries(options?.loggerLevels || {})
            .map(([loggerName, level]) => [loggerName, this.logLevelMap[level]]));
    }

    /**
     * @returns False if the log should be ignored.
     */
    filter(log: LogRecord) {
        const logLevel = this.logLevelMap[log.level];
        if (logLevel < this.globalLevel) {
            return false;
        }
        const loggerLevel = this.loggerLevels[log.loggerName] || 0;
        if (logLevel < loggerLevel) {
            return false;
        }
        return true;
    }
}

/**
 * Log handler that logs to console.
 * 
 * @param formatter - Formatter to use for log messages, default BasicLogFormatter
 */
export class ConsoleLogHandler implements LogHandler {
    private logLevelMap = {
        'DEBUG': console.debug,
        'INFO': console.info,
        'WARNING': console.warn,
        'ERROR': console.error,
    }

    private formatter: LogFormatter;

    constructor(formatter?: LogFormatter) {
        this.formatter = formatter || new BasicLogFormatter();
    }

    log(log: LogRecord) {
        const message = this.formatter.format(log);
        this.logLevelMap[log.level](message);
    }
}

/**
 * Log handler that stores logs in memory with option to retrieve later.
 * 
 * Useful for keeping logs around and retrieve them on demand when an error
 * occures.
 * 
 * @param formatter - Formatter to use for log messages, default JSONLogFormatter
 * @param maxLogs - Maximum number of logs to store, default 10000
 */
export class MemoryLogHandler implements LogHandler {
    private logs: string[] = [];

    private formatter: LogFormatter;

    constructor(formatter?: LogFormatter, private maxLogs = 10000) {
        this.formatter = formatter || new JSONLogFormatter();
        this.maxLogs = maxLogs;
    }

    log(log: LogRecord) {
        const message = this.formatter.format(log);
        this.logs.push(message);

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
    }
}

/**
 * Formatter that formats logs as JSON.
 * 
 * Useful for machine processing.
 */
export class JSONLogFormatter implements LogFormatter {
    format(log: LogRecord) {
        if (log.error instanceof Error) {
            return JSON.stringify({
                ...log,
                error: log.error.message,
                stack: log.error.stack,
            });
        }
        return JSON.stringify(log);
    }
}

/**
 * Formatter that formats logs as plain text.
 * 
 * Useful for human reading.
 */
export class BasicLogFormatter implements LogFormatter {
    format(log: LogRecord) {
        let errorDetails = '';
        if (log.error) {
            errorDetails = log.error instanceof Error
                ? `\nError: ${log.error.message}\nStack:\n${log.error.stack}`
                : `\nError: ${log.error}`;
        }
        return `${log.time.toISOString()} ${log.level} [${log.loggerName}] ${log.message}${errorDetails}`;
    }
}

class ConsoleMetricHandler<T extends MetricEvent> implements MetricHandler<T> {
    onEvent(metric: MetricRecord<T>) {
        console.info(`${metric.time.toISOString()} INFO [metric] ${metric.event.eventName} ${JSON.stringify({ ...metric.event, name: undefined })}`);
    }
}
