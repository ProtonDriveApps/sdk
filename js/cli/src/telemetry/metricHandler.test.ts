import { MetricVolumeType } from '@protontech/drive-sdk';

import type { ApiClient } from '../api';
import { MetricHandler } from './metricHandler';
import { Metrics, MetricsRequestService } from './metrics';
import { captureMessage } from './sentry';

jest.mock('./sentry', () => ({
    captureMessage: jest.fn(),
}));

const metricsMocks = {
    drive_sdk_api_retry_succeeded_total: { increment: jest.fn() },
    drive_sdk_debounce_total: { increment: jest.fn() },
    drive_sdk_upload_success_rate_total: { increment: jest.fn() },
    drive_sdk_upload_errors_total: { increment: jest.fn() },
    drive_sdk_upload_errors_transfer_size_histogram: { observe: jest.fn() },
    drive_sdk_upload_errors_file_size_histogram: { observe: jest.fn() },
    drive_sdk_upload_erroring_users_total: { increment: jest.fn() },
    drive_sdk_download_success_rate_total: { increment: jest.fn() },
    drive_sdk_download_errors_total: { increment: jest.fn() },
    drive_sdk_download_errors_transfer_size_histogram: { observe: jest.fn() },
    drive_sdk_download_errors_file_size_histogram: { observe: jest.fn() },
    drive_sdk_download_erroring_users_total: { increment: jest.fn() },
    drive_sdk_integrity_decryption_errors_total: { increment: jest.fn() },
    drive_sdk_integrity_verification_errors_total: { increment: jest.fn() },
    drive_sdk_integrity_erroring_users_total: { increment: jest.fn() },
    drive_sdk_integrity_block_verification_errors_total: { increment: jest.fn() },
    drive_sdk_volume_events_subscriptions_histogram: { observe: jest.fn() },
};

jest.mock('./metrics', () => ({
    Metrics: jest.fn(() => metricsMocks),
    MetricsRequestService: jest.fn(),
}));

const mockApiClient = {
    authenticatedRequest: jest.fn(),
    baseUrlWithProtocol: 'https://api.proton.local',
} as unknown as ApiClient;

describe('MetricHandler', () => {
    let metricHandler: MetricHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

        metricHandler = new MetricHandler();
        metricHandler.init(mockApiClient, 'free');
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('initializes metrics with the API client', () => {
        expect(MetricsRequestService).toHaveBeenCalledWith(
            mockApiClient.authenticatedRequest,
            'https://api.proton.local/api/data/v1/metrics',
        );
        expect(Metrics).toHaveBeenCalled();
    });

    describe('apiRetrySucceeded', () => {
        it('should report api retry succeeded metric', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'apiRetrySucceeded',
                    url: 'https://api.proton.me/drive/v1/files',
                    failedAttempts: 3,
                },
            });

            expect(metricsMocks.drive_sdk_api_retry_succeeded_total.increment).toHaveBeenCalledWith({
                volumeType: 'unknown',
            });
        });
    });

    describe('debounceLongWait', () => {
        it('should report debounce metric', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'debounceLongWait',
                },
            });

            expect(metricsMocks.drive_sdk_debounce_total.increment).toHaveBeenCalledWith({});
        });
    });

    describe('upload', () => {
        describe('successful upload', () => {
            it('should report success metrics without error tracking', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 1024,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                    },
                });

                expect(metricsMocks.drive_sdk_upload_success_rate_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    status: 'success',
                });

                expect(metricsMocks.drive_sdk_upload_errors_total.increment).not.toHaveBeenCalled();
                expect(
                    metricsMocks.drive_sdk_upload_errors_transfer_size_histogram.observe,
                ).not.toHaveBeenCalled();
                expect(metricsMocks.drive_sdk_upload_errors_file_size_histogram.observe).not.toHaveBeenCalled();
                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).not.toHaveBeenCalled();
            });
        });

        describe('unsuccessful upload', () => {
            it('should report failure metrics for known error', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 512,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: '4xx',
                    },
                });

                expect(metricsMocks.drive_sdk_upload_success_rate_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    status: 'failure',
                });
                expect(metricsMocks.drive_sdk_upload_errors_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    type: '4xx',
                });
                expect(metricsMocks.drive_sdk_upload_errors_transfer_size_histogram.observe).toHaveBeenCalledWith({
                    Value: 512,
                    Labels: {},
                });
                expect(metricsMocks.drive_sdk_upload_errors_file_size_histogram.observe).toHaveBeenCalledWith({
                    Value: 4095,
                    Labels: {},
                });
                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    userPlan: 'free',
                });
                expect(captureMessage).not.toHaveBeenCalled();
            });

            it('should capture sentry message for unknown upload error', () => {
                const originalError = new Error('some error');

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 512,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'unknown',
                        originalError,
                    },
                });

                expect(captureMessage).toHaveBeenCalledWith('Metric event details: upload error', {
                    level: 'debug',
                    tags: {
                        driveSdkMetricEvent: 'uploadError',
                    },
                    extra: {
                        error: originalError,
                        errorType: 'unknown',
                    },
                });
            });

            it('should not report success rate or erroring users for network_error', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 512,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'network_error',
                    },
                });

                expect(metricsMocks.drive_sdk_upload_success_rate_total.increment).not.toHaveBeenCalled();
                expect(metricsMocks.drive_sdk_upload_errors_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    type: 'network_error',
                });
                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).not.toHaveBeenCalled();
            });
        });

        describe('erroring users reporting', () => {
            it('should report erroring users once for single event', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 512,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'unknown',
                    },
                });

                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).toHaveBeenCalledTimes(1);
                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    userPlan: 'free',
                });
            });

            it('should not report erroring users twice for events right after each other', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 512,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'unknown',
                    },
                });

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 256,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'server_error',
                    },
                });

                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).toHaveBeenCalledTimes(1);
            });

            it('should report erroring users twice for events five minutes apart', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 512,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'unknown',
                    },
                });

                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).toHaveBeenCalledTimes(1);

                jest.advanceTimersByTime(5 * 60 * 1000 + 1);

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'upload',
                        volumeType: MetricVolumeType.OwnVolume,
                        uploadedSize: 256,
                        approximateUploadedSize: 4095,
                        expectedSize: 1024,
                        approximateExpectedSize: 4095,
                        error: 'server_error',
                    },
                });

                expect(metricsMocks.drive_sdk_upload_erroring_users_total.increment).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('download', () => {
        describe('successful download', () => {
            it('should report success metrics without error tracking', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 1024,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                    },
                });

                expect(metricsMocks.drive_sdk_download_success_rate_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    status: 'success',
                });

                expect(metricsMocks.drive_sdk_download_errors_total.increment).not.toHaveBeenCalled();
                expect(
                    metricsMocks.drive_sdk_download_errors_transfer_size_histogram.observe,
                ).not.toHaveBeenCalled();
                expect(metricsMocks.drive_sdk_download_errors_file_size_histogram.observe).not.toHaveBeenCalled();
                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).not.toHaveBeenCalled();
            });
        });

        describe('unsuccessful download', () => {
            it('should report failure metrics for known error', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: '4xx',
                    },
                });

                expect(metricsMocks.drive_sdk_download_success_rate_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    status: 'failure',
                });
                expect(metricsMocks.drive_sdk_download_errors_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    type: '4xx',
                });
                expect(metricsMocks.drive_sdk_download_errors_transfer_size_histogram.observe).toHaveBeenCalledWith({
                    Value: 512,
                    Labels: {},
                });
                expect(metricsMocks.drive_sdk_download_errors_file_size_histogram.observe).toHaveBeenCalledWith({
                    Value: 4095,
                    Labels: {},
                });
                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    userPlan: 'free',
                });
                expect(captureMessage).not.toHaveBeenCalled();
            });

            it('should capture sentry message for unknown download error', () => {
                const originalError = new Error('some error');

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'unknown',
                        originalError,
                    },
                });

                expect(captureMessage).toHaveBeenCalledWith('Metric event details: download error', {
                    level: 'debug',
                    tags: {
                        driveSdkMetricEvent: 'downloadError',
                    },
                    extra: {
                        error: originalError,
                    },
                });
            });

            it('should not report success rate or erroring users for network_error', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'network_error',
                    },
                });

                expect(metricsMocks.drive_sdk_download_success_rate_total.increment).not.toHaveBeenCalled();
                expect(metricsMocks.drive_sdk_download_errors_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    type: 'network_error',
                });
                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).not.toHaveBeenCalled();
            });

            it('should handle missing claimedFileSize', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        error: 'network_error',
                    },
                });

                expect(metricsMocks.drive_sdk_download_errors_file_size_histogram.observe).toHaveBeenCalledWith({
                    Value: 0,
                    Labels: {},
                });
            });
        });

        describe('erroring users reporting', () => {
            it('should report erroring users once for single event', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'unknown',
                    },
                });

                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).toHaveBeenCalledTimes(1);
                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).toHaveBeenCalledWith({
                    volumeType: 'own_volume',
                    userPlan: 'free',
                });
            });

            it('should not report erroring users twice for events right after each other', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'unknown',
                    },
                });

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 256,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'decryption_error',
                    },
                });

                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).toHaveBeenCalledTimes(1);
            });

            it('should report erroring users twice for events five minutes apart', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 512,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'unknown',
                    },
                });

                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).toHaveBeenCalledTimes(1);

                jest.advanceTimersByTime(5 * 60 * 1000 + 1);

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'download',
                        volumeType: MetricVolumeType.OwnVolume,
                        downloadedSize: 256,
                        approximateDownloadedSize: 4095,
                        claimedFileSize: 1024,
                        approximateClaimedFileSize: 4095,
                        error: 'decryption_error',
                    },
                });

                expect(metricsMocks.drive_sdk_download_erroring_users_total.increment).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('decryptionError', () => {
        it('should report decryption error metrics', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'decryptionError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeKey',
                    fromBefore2024: true,
                    error: 'Invalid key',
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_decryption_errors_total.increment).toHaveBeenCalledWith({
                volumeType: 'own_volume',
                field: 'nodeKey',
                fromBefore2024: 'yes',
            });
        });

        it('should handle undefined fromBefore2024', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'decryptionError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeKey',
                    fromBefore2024: undefined,
                    error: 'Invalid key',
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_decryption_errors_total.increment).toHaveBeenCalledWith({
                volumeType: 'own_volume',
                field: 'nodeKey',
                fromBefore2024: 'unknown',
            });
        });

        it('should report erroring users when not from before 2024', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'decryptionError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeKey',
                    fromBefore2024: false,
                    error: 'Invalid key',
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).toHaveBeenCalledWith({
                volumeType: 'own_volume',
                userPlan: 'free',
            });
        });

        it('should capture sentry message for new decryption errors', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'decryptionError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeKey',
                    fromBefore2024: false,
                    error: 'Invalid key',
                    uid: 'uid',
                },
            });

            expect(captureMessage).toHaveBeenCalledWith('Metric event details: decryption error', {
                level: 'error',
                tags: {
                    driveSdkMetricEvent: 'decryptionError',
                },
                extra: {
                    volumeType: MetricVolumeType.OwnVolume,
                    uid: 'uid',
                    field: 'nodeKey',
                    fromBefore2024: false,
                    error: 'Invalid key',
                },
            });
        });

        it('should not capture sentry message when fromBefore2024 is true', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'decryptionError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeKey',
                    fromBefore2024: true,
                    error: 'Invalid key',
                    uid: 'uid',
                },
            });

            expect(captureMessage).not.toHaveBeenCalled();
        });

        it('should not report erroring users when fromBefore2024 is true', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'decryptionError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeKey',
                    fromBefore2024: true,
                    error: 'Invalid key',
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).not.toHaveBeenCalled();
        });

        describe('erroring users reporting', () => {
            it('should not report erroring users twice for events right after each other', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'decryptionError',
                        volumeType: MetricVolumeType.OwnVolume,
                        field: 'nodeKey',
                        fromBefore2024: false,
                        error: 'Invalid key',
                        uid: 'uid',
                    },
                });

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'verificationError',
                        volumeType: MetricVolumeType.OwnVolume,
                        field: 'nodeName',
                        fromBefore2024: false,
                        addressMatchingDefaultShare: true,
                        uid: 'uid',
                    },
                });

                expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).toHaveBeenCalledTimes(1);
            });

            it('should report erroring users twice for events five minutes apart', () => {
                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'decryptionError',
                        volumeType: MetricVolumeType.OwnVolume,
                        field: 'nodeKey',
                        fromBefore2024: false,
                        error: 'Invalid key',
                        uid: 'uid',
                    },
                });

                expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).toHaveBeenCalledTimes(1);

                jest.advanceTimersByTime(5 * 60 * 1000 + 1);

                metricHandler.onEvent({
                    time: new Date(),
                    event: {
                        eventName: 'verificationError',
                        volumeType: MetricVolumeType.OwnVolume,
                        field: 'nodeName',
                        fromBefore2024: false,
                        addressMatchingDefaultShare: true,
                        uid: 'uid',
                    },
                });

                expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('verificationError', () => {
        it('should report verification error metrics', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'verificationError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeName',
                    fromBefore2024: false,
                    addressMatchingDefaultShare: true,
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_verification_errors_total.increment).toHaveBeenCalledWith({
                volumeType: 'own_volume',
                field: 'nodeName',
                addressMatchingDefaultShare: 'yes',
                fromBefore2024: 'no',
            });
        });

        it('should handle undefined boolean values', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'verificationError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeName',
                    fromBefore2024: undefined,
                    addressMatchingDefaultShare: undefined,
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_verification_errors_total.increment).toHaveBeenCalledWith({
                volumeType: 'own_volume',
                field: 'nodeName',
                addressMatchingDefaultShare: 'unknown',
                fromBefore2024: 'unknown',
            });
        });

        it('should not report erroring users unless address matches default share', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'verificationError',
                    volumeType: MetricVolumeType.OwnVolume,
                    field: 'nodeName',
                    fromBefore2024: false,
                    addressMatchingDefaultShare: false,
                    uid: 'uid',
                },
            });

            expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).not.toHaveBeenCalled();
        });
    });

    describe('blockVerificationError', () => {
        it('should report block verification error metrics', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'blockVerificationError',
                    volumeType: MetricVolumeType.Unknown,
                    retryHelped: true,
                },
            });

            expect(metricsMocks.drive_sdk_integrity_block_verification_errors_total.increment).toHaveBeenCalledWith({
                retryHelped: 'yes',
            });
            expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).not.toHaveBeenCalled();
        });

        it('should report erroring users when retry did not help', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'blockVerificationError',
                    volumeType: MetricVolumeType.Unknown,
                    retryHelped: false,
                },
            });

            expect(metricsMocks.drive_sdk_integrity_block_verification_errors_total.increment).toHaveBeenCalledWith({
                retryHelped: 'no',
            });
            expect(metricsMocks.drive_sdk_integrity_erroring_users_total.increment).toHaveBeenCalledWith({
                volumeType: 'unknown',
                userPlan: 'free',
            });
        });
    });

    describe('volumeEventsSubscriptionsChanged', () => {
        it('should report volume events subscriptions histogram', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'volumeEventsSubscriptionsChanged',
                    numberOfVolumeSubscriptions: 5,
                },
            });

            expect(metricsMocks.drive_sdk_volume_events_subscriptions_histogram.observe).toHaveBeenCalledWith({
                Value: 5,
                Labels: {
                    userPlan: 'free',
                },
            });
        });
    });

    describe('unknown event', () => {
        it('should not report metrics for unknown event types', () => {
            metricHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'unknownEvent',
                    someProperty: 'value',
                } as never,
            });

            Object.values(metricsMocks).forEach((metric) => {
                if ('increment' in metric) {
                    expect(metric.increment).not.toHaveBeenCalled();
                }
                if ('observe' in metric) {
                    expect(metric.observe).not.toHaveBeenCalled();
                }
            });
        });
    });

    describe('before init', () => {
        it('should not report metrics when handler is not initialized', () => {
            const uninitializedHandler = new MetricHandler();

            uninitializedHandler.onEvent({
                time: new Date(),
                event: {
                    eventName: 'apiRetrySucceeded',
                    url: 'https://api.proton.me/drive/v1/files',
                    failedAttempts: 1,
                },
            });

            expect(metricsMocks.drive_sdk_api_retry_succeeded_total.increment).not.toHaveBeenCalled();
        });
    });
});
