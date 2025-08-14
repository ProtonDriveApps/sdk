import { RateLimitedError, ValidationError, IntegrityError } from '../../errors';
import { ProtonDriveTelemetry } from '../../interface';
import { APIHTTPError } from '../apiService';
import { SharesService } from './interface';
import { UploadTelemetry } from './telemetry';

describe('UploadTelemetry', () => {
    let mockTelemetry: jest.Mocked<ProtonDriveTelemetry>;
    let sharesService: jest.Mocked<SharesService>;
    let uploadTelemetry: UploadTelemetry;

    const parentNodeUid = 'volumeId~parentNodeId';
    const revisionUid = 'volumeId~nodeId~revisionId';

    beforeEach(() => {
        mockTelemetry = {
            recordMetric: jest.fn(),
            getLogger: jest.fn().mockReturnValue({
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            }),
        } as unknown as jest.Mocked<ProtonDriveTelemetry>;

        sharesService = {
            getVolumeMetricContext: jest.fn().mockResolvedValue('own_volume'),
        };

        uploadTelemetry = new UploadTelemetry(mockTelemetry, sharesService);
    });

    it('should log failure during init (excludes uploaded size)', async () => {
        const error = new Error('Failed');
        await uploadTelemetry.uploadInitFailed(parentNodeUid, error, 1000);

        expect(mockTelemetry.recordMetric).toHaveBeenCalledWith({
            eventName: 'upload',
            volumeType: 'own_volume',
            uploadedSize: 0,
            expectedSize: 1000,
            error: 'unknown',
            originalError: error,
        });
    });

    it('should log failure upload', async () => {
        const error = new Error('Failed');
        await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);

        expect(mockTelemetry.recordMetric).toHaveBeenCalledWith({
            eventName: 'upload',
            volumeType: 'own_volume',
            uploadedSize: 500,
            expectedSize: 1000,
            error: 'unknown',
            originalError: error,
        });
    });

    it('should log successful upload (excludes error)', async () => {
        await uploadTelemetry.uploadFinished(revisionUid, 1000);

        expect(mockTelemetry.recordMetric).toHaveBeenCalledWith({
            eventName: 'upload',
            volumeType: 'own_volume',
            uploadedSize: 1000,
            expectedSize: 1000,
        });
    });

    describe('detect error category', () => {
        const verifyErrorCategory = (error: string) => {
            expect(mockTelemetry.recordMetric).toHaveBeenCalledWith(
                expect.objectContaining({
                    error,
                }),
            );
        };

        it('should ignore ValidationError', async () => {
            const error = new ValidationError('Validation error');
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            expect(mockTelemetry.recordMetric).not.toHaveBeenCalled();
        });

        it('should ignore AbortError', async () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);

            expect(mockTelemetry.recordMetric).not.toHaveBeenCalled();
        });

        it('should detect "rate_limited" error for RateLimitedError', async () => {
            const error = new RateLimitedError('Rate limited');
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            verifyErrorCategory('rate_limited');
        });

        it('should detect "integrity_error" for IntegrityError', async () => {
            const error = new IntegrityError('Integrity check failed');
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            verifyErrorCategory('integrity_error');
        });

        it('should detect "4xx" error for APIHTTPError with 4xx status code', async () => {
            const error = new APIHTTPError('Client error', 404);
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            verifyErrorCategory('4xx');
        });

        it('should detect "5xx" error for APIHTTPError with 5xx status code', async () => {
            const error = new APIHTTPError('Server error', 500);
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            verifyErrorCategory('server_error');
        });

        it('should detect "server_error" for TimeoutError', async () => {
            const error = new Error('Timeout');
            error.name = 'TimeoutError';
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            verifyErrorCategory('server_error');
        });

        it('should detect "network_error" for NetworkError', async () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';
            await uploadTelemetry.uploadFailed(revisionUid, error, 500, 1000);
            verifyErrorCategory('network_error');
        });
    });
});
