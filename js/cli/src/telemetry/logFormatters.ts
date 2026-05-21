import {
    BasicLogFormatter,
    LogLevel,
    LogRecord,
} from '@protontech/drive-sdk/telemetry';

export class ColoredLogFormatter extends BasicLogFormatter {
    format(log: LogRecord) {
        const color = {
            [LogLevel.DEBUG]: '\x1b[1;90m',
            [LogLevel.INFO]: '\x1b[1;34m',
            [LogLevel.WARNING]: '\x1b[1;33m',
            [LogLevel.ERROR]: '\x1b[1;31m',
        }[log.level];

        const result = super.format(log);
        return `${color}${result}\x1b[0m`;
    }
}
