import path from 'node:path';

import {
    BasicLogFormatter,
    LogFormatter,
    LogHandler,
    LogRecord,
    MetricEvent,
    MetricRecord,
} from '@protontech/drive-sdk/telemetry';

export class FileLogHandler implements LogHandler {
    private formatter: LogFormatter;
    private writer: Bun.FileSink;

    constructor(logDir: string) {
        this.formatter = new BasicLogFormatter();

        const logFile = path.join(logDir, 'proton-drive.log');
        const file = Bun.file(logFile);
        this.writer = file.writer();
    }

    log(log: LogRecord) {
        const message = this.formatter.format(log);
        void this.writer.write(message);
        void this.writer.write('\n');
        void this.writer.flush();
    }

    onEvent(metric: MetricRecord<MetricEvent>) {
        const message = JSON.stringify(metric);
        void this.writer.write(message);
        void this.writer.write('\n');
        void this.writer.flush();
    }
}
