import { RateLimitedError, ValidationError, DecryptionError, IntegrityError } from '../../errors';
import { ProtonDriveTelemetry } from '../../interface';
import { APIHTTPError } from '../apiService';
import { SharesService } from './interface';
import { DownloadTelemetry } from './telemetry';

describe('DownloadTelemetry', () => {
    let mockTelemetry: jest.Mocked<ProtonDriveTelemetry>;
    let sharesService: jest.Mocked<SharesService>;
    let downloadTelemetry: DownloadTelemetry;

    const nodeUid = 'volumeId~nodeId';
    const revisionUid = 'volumeId~nodeId~revisionId';

    beforeEach(() => {
        mockTelemetry = {
            logEvent: jest.fn(),
            getLogger: jest.fn().mockReturnValue({
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            }),
        } as unknown as jest.Mocked<ProtonDriveTelemetry>;

        sharesService = {
            getVolumeMetricContext: jest.fn().mockResolvedValue('own_volume'),
        }

        downloadTelemetry = new DownloadTelemetry(mockTelemetry, sharesService);
    });

    it('should log failure during init (excludes file size)', async () => {
        const error = new Error('Failed');
        await downloadTelemetry.downloadInitFailed(nodeUid, error);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "download",
            volumeType: "own_volume",
            downloadedSize: 0,
            error: "unknown",
            originalError: error,
        });
    });

    it('should log failure download', async () => {
        const error = new Error('Failed');
        await downloadTelemetry.downloadFailed(revisionUid, error, 123, 456);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "download",
            volumeType: "own_volume",
            downloadedSize: 123,
            claimedFileSize: 456,
            error: "unknown",
            originalError: error,
        });
    });

    it('should log successful download (excludes error)', async () => {
        await downloadTelemetry.downloadFinished(revisionUid, 500);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "download",
            volumeType: "own_volume",
            downloadedSize: 500,
            claimedFileSize: 500,
        });
    });

    describe('detect error category', () => {
        const verifyErrorCategory = (error: string) => {
            expect(mockTelemetry.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    error,
                })
            );
        }

        it('should ignore ValidationError', async () => {
            const error = new ValidationError('Validation error');
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            expect(mockTelemetry.logEvent).not.toHaveBeenCalled();
        });

        it('should ignore AbortError', async () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);

            expect(mockTelemetry.logEvent).not.toHaveBeenCalled();
        });

        it('should detect "rate_limited" error for RateLimitedError', async () => {
            const error = new RateLimitedError('Rate limited');
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('rate_limited');
        });

        it('should detect "decryption_error" for DecryptionError', async () => {
            const error = new DecryptionError('Decryption failed');
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('decryption_error');
        });

        it('should detect "integrity_error" for IntegrityError', async () => {
            const error = new IntegrityError('Integrity check failed');
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('integrity_error');
        });

        it('should detect "4xx" error for APIHTTPError with 4xx status code', async () => {
            const error = new APIHTTPError('Client error', 404);
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('4xx');
        });

        it('should detect "5xx" error for APIHTTPError with 5xx status code', async () => {
            const error = new APIHTTPError('Server error', 500);
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('server_error');
        });

        it('should detect "server_error" for TimeoutError', async () => {
            const error = new Error('Timeout');
            error.name = 'TimeoutError';
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('server_error');
        });

        it('should detect "network_error" for NetworkError', async () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';
            await downloadTelemetry.downloadFailed(revisionUid, error, 100, 200);
            verifyErrorCategory('network_error');
        });
    });
});
