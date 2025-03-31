import { RateLimitedError, ValidationError, DecryptionError, IntegrityError } from "../../errors";
import { ProtonDriveTelemetry, MetricsDownloadErrorType } from "../../interface";
import { LoggerWithPrefix } from "../../telemetry";
import { APIHTTPError } from '../apiService';

export class DownloadTelemetry {
    constructor(private telemetry: ProtonDriveTelemetry) {
        this.telemetry = telemetry;
    }

    getLoggerForNode(nodeUid: string) {
        const logger = this.telemetry.getLogger("download");
        return new LoggerWithPrefix(logger, `node ${nodeUid}`);
    }

    downloadInitFailed(error: unknown) {
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        this.sendTelemetry({
            downloadedSize: 0,
            error: errorCategory,
        });
    }

    downloadFailed(error: unknown, downloadedSize: number, claimedFileSize?: number) {
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        this.sendTelemetry({
            downloadedSize,
            claimedFileSize,
            error: errorCategory,
        });
    }

    downloadFinished(downloadedSize: number) {
        this.sendTelemetry({
            downloadedSize,
            claimedFileSize: downloadedSize,
        });
    }

    private sendTelemetry(options: {
        downloadedSize: number,
        claimedFileSize?: number,
        error?: MetricsDownloadErrorType,
    }) {
        this.telemetry.logEvent({
            eventName: 'download',
            context: 'own_volume', // TODO: pass context
            ...options,
        });
    }
}

function getErrorCategory(error: unknown): MetricsDownloadErrorType | undefined {
    if (error instanceof ValidationError) {
        return undefined;
    }
    if (error instanceof RateLimitedError) {
        return 'rate_limited';
    }
    if (error instanceof DecryptionError) {
        return 'decryption_error';
    }
    if (error instanceof IntegrityError) {
        return 'integrity_error';
    }
    if (error instanceof APIHTTPError) {
        if (error.statusCode >= 400 && error.statusCode < 500) {
            return '4xx';
        }
        if (error.statusCode >= 500) {
            return '5xx';
        }
    }
    if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
            return 'server_error';
        }
        if (error.name === 'OfflineError' || error.name === 'NetworkError' || error.message?.toLowerCase() === 'network error') {
            return 'network_error';
        }
        if (error.name === 'AbortError') {
            return undefined;
        }
    }
    return 'unknown';
}
