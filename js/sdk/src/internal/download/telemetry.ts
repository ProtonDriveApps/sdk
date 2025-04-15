import { RateLimitedError, ValidationError, DecryptionError, IntegrityError } from "../../errors";
import { ProtonDriveTelemetry, MetricsDownloadErrorType, Logger } from "../../interface";
import { LoggerWithPrefix } from "../../telemetry";
import { APIHTTPError } from '../apiService';
import { splitNodeRevisionUid, splitNodeUid } from "../uids";
import { SharesService } from "./interface";

export class DownloadTelemetry {
    private logger: Logger;

    constructor(private telemetry: ProtonDriveTelemetry, private sharesService: SharesService) {
        this.telemetry = telemetry;
        this.logger = this.telemetry.getLogger("download");
        this.sharesService = sharesService;
    }

    getLoggerForRevision(revisionUid: string) {
        return new LoggerWithPrefix(this.logger, `revision ${revisionUid}`);
    }

    async downloadInitFailed(nodeUid: string, error: unknown) {
        const { volumeId } = splitNodeUid(nodeUid);
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        await this.sendTelemetry(volumeId, {
            downloadedSize: 0,
            error: errorCategory,
        });
    }

    async downloadFailed(revisionUid: string, error: unknown, downloadedSize: number, claimedFileSize?: number) {
        const { volumeId } = splitNodeRevisionUid(revisionUid);
        const errorCategory = getErrorCategory(error);

        // No error category means ignored error from telemetry.
        // For example, aborted request.
        if (!errorCategory) {
            return;
        }

        await this.sendTelemetry(volumeId, {
            downloadedSize,
            claimedFileSize,
            error: errorCategory,
        });
    }

    async downloadFinished(revisionUid: string, downloadedSize: number) {
        const { volumeId } = splitNodeRevisionUid(revisionUid);
        await this.sendTelemetry(volumeId, {
            downloadedSize,
            claimedFileSize: downloadedSize,
        });
    }

    private async sendTelemetry(volumeId: string, options: {
        downloadedSize: number,
        claimedFileSize?: number,
        error?: MetricsDownloadErrorType,
    }) {
        let context;
        try {
            context = await this.sharesService.getVolumeMetricContext(volumeId);
        } catch (error: unknown) {
            this.logger.error('Failed to get metric context', error);
        }

        this.telemetry.logEvent({
            eventName: 'download',
            context,
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
