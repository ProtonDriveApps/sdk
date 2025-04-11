import { RateLimitedError, ValidationError, IntegrityError } from "../../errors";
import { ProtonDriveTelemetry, MetricsUploadErrorType } from "../../interface";
import { LoggerWithPrefix } from "../../telemetry";
import { APIHTTPError } from '../apiService';

export class UploadTelemetry {
    constructor(private telemetry: ProtonDriveTelemetry) {
        this.telemetry = telemetry;
    }

    getLoggerForRevision(revisionUid: string) {
        const logger = this.telemetry.getLogger("upload");
        return new LoggerWithPrefix(logger, `revision ${revisionUid}`);
    }

    uploadInitFailed(error: unknown, expectedSize: number) {
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        this.sendTelemetry({
            uploadedSize: 0,
            expectedSize,
            error: errorCategory,
        });
    }

    uploadFailed(error: unknown, uploadedSize: number, expectedSize: number) {
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        this.sendTelemetry({
            uploadedSize,
            expectedSize,
            error: errorCategory,
        });
    }

    uploadFinished(uploadedSize: number) {
        this.sendTelemetry({
            uploadedSize,
            expectedSize: uploadedSize,
        });
    }

    private sendTelemetry(options: {
        uploadedSize: number,
        expectedSize: number,
        error?: MetricsUploadErrorType,
    }) {
        this.telemetry.logEvent({
            eventName: 'upload',
            context: 'own_volume', // TODO: pass context
            ...options,
        });
    }
}

function getErrorCategory(error: unknown): MetricsUploadErrorType | undefined {
    if (error instanceof ValidationError) {
        return undefined;
    }
    if (error instanceof RateLimitedError) {
        return 'rate_limited';
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
