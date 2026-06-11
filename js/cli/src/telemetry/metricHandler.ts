import type {
    MetricBlockVerificationErrorEvent,
    MetricDecryptionErrorEvent,
    MetricDownloadEvent,
    MetricEvent,
    MetricUploadEvent,
    MetricVerificationErrorEvent,
    MetricVolumeEventsSubscriptionsChangedEvent,
} from '@protontech/drive-sdk';
import type { MetricHandler as MetricHandlerType, MetricRecord } from '@protontech/drive-sdk/telemetry';
import { reduceSizePrecision } from '@protontech/drive-sdk/telemetry';

import type { ApiClient } from '../api';
import { Metrics, MetricsRequestService } from './metrics';
import { captureMessage } from './sentry';
import { getVerifierFileSizeBucket } from './verifierFileSizeBucket';

export type UserPlan = 'free' | 'paid' | 'anonymous' | 'unknown';

const REPORT_ERRORING_USERS_INTERVAL_MS = 5 * 60 * 1000;

export interface CliMetrics {
    reportUploadVerifierAttempt(): void;
    reportDownloadVerifierAttempt(params: {
        result: 'success' | 'failure' | 'skipped';
        fileSize: number;
        checksumVerified: boolean;
    }): void;
}

export class MetricHandler implements MetricHandlerType<MetricEvent>, CliMetrics {
    private metrics?: Metrics;
    private handler?: ConfiguredMetricHandler;
    private requestService?: MetricsRequestService;

    init(apiClient: ApiClient, userPlan: UserPlan) {
        this.requestService = new MetricsRequestService(
            apiClient.authenticatedRequest,
            `${apiClient.baseUrlWithProtocol}/api/data/v1/metrics`,
        );
        this.metrics = new Metrics(this.requestService);
        this.handler = new ConfiguredMetricHandler(this.metrics, userPlan);
    }

    async flush() {
        await this.requestService?.processAllRequests();
    }

    onEvent(metric: MetricRecord<MetricEvent>): void {
        this.handler?.onEvent(metric);
    }

    reportUploadVerifierAttempt(): void {
        this.metrics?.drive_upload_verifier_attempts_total.increment({
            sha1Provided: 'true',
        });
    }

    reportDownloadVerifierAttempt(params: {
        result: 'success' | 'failure' | 'skipped';
        fileSize: number;
        checksumVerified: boolean;
    }): void {
        this.metrics?.drive_download_verifier_attempts_total.increment({
            result: params.result,
            fileSize: getVerifierFileSizeBucket(params.fileSize),
            checksumVerified: params.checksumVerified ? 'true' : 'false',
        });
    }
}

class ConfiguredMetricHandler {
    private lastUploadError: Date | undefined;
    private lastDownloadError: Date | undefined;
    private lastIntegrityError: Date | undefined;

    constructor(
        private readonly metrics: Metrics,
        private readonly userPlan: UserPlan,
    ) {}

    onEvent(metric: MetricRecord<MetricEvent>): void {
        switch (metric.event.eventName) {
            case 'apiRetrySucceeded':
                this.onApiRetrySucceeded();
                break;
            case 'debounceLongWait':
                this.onDebounceLongWait();
                break;
            case 'upload':
                this.onUpload(metric.event);
                break;
            case 'download':
                this.onDownload(metric.event);
                break;
            case 'decryptionError':
                this.onDecryptionError(metric.event);
                break;
            case 'verificationError':
                this.onVerificationError(metric.event);
                break;
            case 'blockVerificationError':
                this.onBlockVerificationError(metric.event);
                break;
            case 'volumeEventsSubscriptionsChanged':
                this.onVolumeEventsSubscriptionsChanged(metric.event);
                break;
            default:
                break;
        }
    }

    private onApiRetrySucceeded() {
        this.metrics.drive_sdk_api_retry_succeeded_total.increment({
            volumeType: 'unknown',
        });
    }

    private onDebounceLongWait() {
        this.metrics.drive_sdk_debounce_total.increment({});
    }

    private onUpload(metric: MetricUploadEvent) {
        if (metric.error !== 'network_error' && metric.error !== 'validation_error') {
            this.metrics.drive_sdk_upload_success_rate_total.increment({
                volumeType: metric.volumeType,
                status: !metric.error ? 'success' : 'failure',
            });
        }

        if (!metric.error) {
            return;
        }

        this.metrics.drive_sdk_upload_errors_total.increment({
            volumeType: metric.volumeType,
            type: metric.error,
        });
        this.metrics.drive_sdk_upload_errors_transfer_size_histogram.observe({
            Value: metric.uploadedSize,
            Labels: {},
        });
        this.metrics.drive_sdk_upload_errors_file_size_histogram.observe({
            Value: reduceSizePrecision(metric.expectedSize),
            Labels: {},
        });

        if (
            metric.error !== 'network_error' &&
            metric.error !== 'validation_error' &&
            (!this.lastUploadError || this.lastUploadError.getTime() < Date.now() - REPORT_ERRORING_USERS_INTERVAL_MS)
        ) {
            this.metrics.drive_sdk_upload_erroring_users_total.increment({
                volumeType: metric.volumeType,
                userPlan: this.userPlan,
            });
            this.lastUploadError = new Date();
        }

        if (metric.error === 'unknown' || metric.error === 'integrity_error') {
            captureMessage('Metric event details: upload error', {
                level: 'debug', // Debug as we need it only when we investigate metric reports.
                tags: {
                    driveSdkMetricEvent: 'uploadError',
                },
                extra: {
                    error: metric.originalError,
                    errorType: metric.error,
                },
            });
        }
    }

    private onDownload(metric: MetricDownloadEvent) {
        if (metric.error !== 'network_error' && metric.error !== 'validation_error') {
            this.metrics.drive_sdk_download_success_rate_total.increment({
                volumeType: metric.volumeType,
                status: !metric.error ? 'success' : 'failure',
            });
        }

        if (!metric.error) {
            return;
        }

        this.metrics.drive_sdk_download_errors_total.increment({
            volumeType: metric.volumeType,
            type: metric.error,
        });
        this.metrics.drive_sdk_download_errors_transfer_size_histogram.observe({
            Value: metric.downloadedSize,
            Labels: {},
        });
        this.metrics.drive_sdk_download_errors_file_size_histogram.observe({
            Value: reduceSizePrecision(metric.claimedFileSize || 0),
            Labels: {},
        });

        if (
            metric.error !== 'network_error' &&
            metric.error !== 'validation_error' &&
            (!this.lastDownloadError ||
                this.lastDownloadError.getTime() < Date.now() - REPORT_ERRORING_USERS_INTERVAL_MS)
        ) {
            this.metrics.drive_sdk_download_erroring_users_total.increment({
                volumeType: metric.volumeType,
                userPlan: this.userPlan,
            });
            this.lastDownloadError = new Date();
        }

        if (metric.error === 'unknown' || metric.error === 'integrity_error') {
            captureMessage('Metric event details: download error', {
                level: 'debug', // Debug as we need it only when we investigate metric reports.
                tags: {
                    driveSdkMetricEvent: 'downloadError',
                },
                extra: {
                    error: metric.originalError,
                },
            });
        }
    }

    private onDecryptionError(metric: MetricDecryptionErrorEvent) {
        this.metrics.drive_sdk_integrity_decryption_errors_total.increment({
            volumeType: metric.volumeType,
            field: metric.field,
            fromBefore2024: getYesNoUnknown(metric.fromBefore2024),
        });

        if (metric.fromBefore2024 === false) {
            this.reportIntegrityErroringUsers(metric);

            captureMessage('Metric event details: decryption error', {
                level: 'error',
                tags: {
                    driveSdkMetricEvent: 'decryptionError',
                },
                extra: {
                    volumeType: metric.volumeType,
                    uid: metric.uid,
                    field: metric.field,
                    fromBefore2024: metric.fromBefore2024,
                    error: metric.error,
                },
            });
        }
    }

    private onVerificationError(metric: MetricVerificationErrorEvent) {
        this.metrics.drive_sdk_integrity_verification_errors_total.increment({
            volumeType: metric.volumeType,
            field: metric.field,
            addressMatchingDefaultShare: getYesNoUnknown(metric.addressMatchingDefaultShare),
            fromBefore2024: getYesNoUnknown(metric.fromBefore2024),
        });

        if (metric.fromBefore2024 === false && metric.addressMatchingDefaultShare === true) {
            this.reportIntegrityErroringUsers(metric);
        }
    }

    private onBlockVerificationError(metric: MetricBlockVerificationErrorEvent) {
        this.metrics.drive_sdk_integrity_block_verification_errors_total.increment({
            retryHelped: metric.retryHelped ? 'yes' : 'no',
        });

        if (!metric.retryHelped) {
            this.reportIntegrityErroringUsers(metric);
        }
    }

    private reportIntegrityErroringUsers(
        metric: MetricDecryptionErrorEvent | MetricVerificationErrorEvent | MetricBlockVerificationErrorEvent,
    ) {
        if (
            !this.lastIntegrityError ||
            this.lastIntegrityError.getTime() < Date.now() - REPORT_ERRORING_USERS_INTERVAL_MS
        ) {
            this.metrics.drive_sdk_integrity_erroring_users_total.increment({
                volumeType: 'volumeType' in metric ? metric.volumeType : 'unknown',
                userPlan: this.userPlan,
            });
            this.lastIntegrityError = new Date();
        }
    }

    private onVolumeEventsSubscriptionsChanged(metric: MetricVolumeEventsSubscriptionsChangedEvent) {
        this.metrics.drive_sdk_volume_events_subscriptions_histogram.observe({
            Value: metric.numberOfVolumeSubscriptions,
            Labels: {
                userPlan: this.userPlan,
            },
        });
    }
}

function getYesNoUnknown(value: boolean | undefined): 'yes' | 'no' | 'unknown' {
    if (value === undefined) {
        return 'unknown';
    }
    return value ? 'yes' : 'no';
}
