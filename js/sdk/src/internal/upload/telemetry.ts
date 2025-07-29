import { RateLimitedError, ValidationError, IntegrityError } from '../../errors';
import { ProtonDriveTelemetry, MetricsUploadErrorType, Logger } from '../../interface';
import { LoggerWithPrefix } from '../../telemetry';
import { APIHTTPError } from '../apiService';
import { splitNodeUid, splitNodeRevisionUid } from '../uids';
import { SharesService } from './interface';

export class UploadTelemetry {
    private logger: Logger;

    constructor(
        private telemetry: ProtonDriveTelemetry,
        private sharesService: SharesService,
    ) {
        this.telemetry = telemetry;
        this.logger = this.telemetry.getLogger('download');
        this.sharesService = sharesService;
    }

    getLoggerForRevision(revisionUid: string) {
        const logger = this.telemetry.getLogger('upload');
        return new LoggerWithPrefix(logger, `revision ${revisionUid}`);
    }

    logBlockVerificationError(retryHelped: boolean) {
        this.telemetry.logEvent({
            eventName: 'blockVerificationError',
            retryHelped,
        });
    }

    async uploadInitFailed(parentFolderUid: string, error: unknown, expectedSize: number) {
        const { volumeId } = splitNodeUid(parentFolderUid);
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        await this.sendTelemetry(volumeId, {
            uploadedSize: 0,
            expectedSize,
            error: errorCategory,
            originalError: error,
        });
    }

    async uploadFailed(revisionUid: string, error: unknown, uploadedSize: number, expectedSize: number) {
        const { volumeId } = splitNodeRevisionUid(revisionUid);
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        await this.sendTelemetry(volumeId, {
            uploadedSize,
            expectedSize,
            error: errorCategory,
            originalError: error,
        });
    }

    async uploadFinished(revisionUid: string, uploadedSize: number) {
        const { volumeId } = splitNodeRevisionUid(revisionUid);
        await this.sendTelemetry(volumeId, {
            uploadedSize,
            expectedSize: uploadedSize,
        });
    }

    private async sendTelemetry(
        volumeId: string,
        options: {
            uploadedSize: number;
            expectedSize: number;
            error?: MetricsUploadErrorType;
            originalError?: unknown;
        },
    ) {
        let volumeType;
        try {
            volumeType = await this.sharesService.getVolumeMetricContext(volumeId);
        } catch (error: unknown) {
            this.logger.error('Failed to get metric volume type', error);
        }

        this.telemetry.logEvent({
            eventName: 'upload',
            volumeType,
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
            return 'server_error';
        }
    }
    if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
            return 'server_error';
        }
        if (
            error.name === 'OfflineError' ||
            error.name === 'NetworkError' ||
            error.message?.toLowerCase() === 'network error'
        ) {
            return 'network_error';
        }
        if (error.name === 'AbortError') {
            return undefined;
        }
    }
    return 'unknown';
}
