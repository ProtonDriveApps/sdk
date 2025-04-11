import { RateLimitedError, ValidationError, IntegrityError } from '../../errors';
import { ProtonDriveTelemetry } from '../../interface';
import { APIHTTPError } from '../apiService';
import { UploadTelemetry } from './telemetry';

describe('UploadTelemetry', () => {
    let mockTelemetry: jest.Mocked<ProtonDriveTelemetry>;
    let uploadTelemetry: UploadTelemetry;

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

        uploadTelemetry = new UploadTelemetry(mockTelemetry);
    });

    it('should log failure during init (excludes uploaded size)', () => {
        uploadTelemetry.uploadInitFailed(new Error('Failed'), 1000);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "upload",
            context: "own_volume",
            uploadedSize: 0,
            expectedSize: 1000,
            error: "unknown",
        });
    });

    it('should log failure upload', () => {
        uploadTelemetry.uploadFailed(new Error('Failed'), 500, 1000);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "upload",
            context: "own_volume",
            uploadedSize: 500,
            expectedSize: 1000,
            error: "unknown",
        });
    });

    it('should log successful upload (excludes error)', () => {
        uploadTelemetry.uploadFinished(1000);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "upload",
            context: "own_volume",
            uploadedSize: 1000,
            expectedSize: 1000,
        });
    });

    describe('detect error category', () => {
        const verifyErrorCategory = (error: string) => {
            expect(mockTelemetry.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    error,
                })
            );
        };

        it('should ignore ValidationError', () => {
            const error = new ValidationError('Validation error');
            uploadTelemetry.uploadFailed(error, 500, 1000);
            expect(mockTelemetry.logEvent).not.toHaveBeenCalled();
        });

        it('should ignore AbortError', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            uploadTelemetry.uploadFailed(error, 500, 1000);

            expect(mockTelemetry.logEvent).not.toHaveBeenCalled();
        });

        it('should detect "rate_limited" error for RateLimitedError', () => {
            const error = new RateLimitedError('Rate limited');
            uploadTelemetry.uploadFailed(error, 500, 1000);
            verifyErrorCategory('rate_limited');
        });

        it('should detect "integrity_error" for IntegrityError', () => {
            const error = new IntegrityError('Integrity check failed');
            uploadTelemetry.uploadFailed(error, 500, 1000);
            verifyErrorCategory('integrity_error');
        });

        it('should detect "4xx" error for APIHTTPError with 4xx status code', () => {
            const error = new APIHTTPError('Client error', 404);
            uploadTelemetry.uploadFailed(error, 500, 1000);
            verifyErrorCategory('4xx');
        });

        it('should detect "5xx" error for APIHTTPError with 5xx status code', () => {
            const error = new APIHTTPError('Server error', 500);
            uploadTelemetry.uploadFailed(error, 500, 1000);
            verifyErrorCategory('5xx');
        });

        it('should detect "server_error" for TimeoutError', () => {
            const error = new Error('Timeout');
            error.name = 'TimeoutError';
            uploadTelemetry.uploadFailed(error, 500, 1000);
            verifyErrorCategory('server_error');
        });

        it('should detect "network_error" for NetworkError', () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';
            uploadTelemetry.uploadFailed(error, 500, 1000);
            verifyErrorCategory('network_error');
        });
    });
});