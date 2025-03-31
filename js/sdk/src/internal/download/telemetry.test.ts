import { RateLimitedError, ValidationError, DecryptionError, IntegrityError } from '../../errors';
import { ProtonDriveTelemetry } from '../../interface';
import { APIHTTPError } from '../apiService';
import { DownloadTelemetry } from './telemetry';

describe('DownloadTelemetry', () => {
    let mockTelemetry: jest.Mocked<ProtonDriveTelemetry>;
    let downloadTelemetry: DownloadTelemetry;

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

        downloadTelemetry = new DownloadTelemetry(mockTelemetry);
    });

    it('should log failure during init (excludes file size)', () => {
        downloadTelemetry.downloadInitFailed(new Error('Failed'));

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "download",
            context: "own_volume",
            downloadedSize: 0,
            error: "unknown",
        });
    });

    it('should log failure download', () => {
        downloadTelemetry.downloadFailed(new Error('Failed'), 123, 456);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "download",
            context: "own_volume",
            downloadedSize: 123,
            claimedFileSize: 456,
            error: "unknown",
        });
    });

    it('should log successful download (excludes error)', () => {
        downloadTelemetry.downloadFinished(500);

        expect(mockTelemetry.logEvent).toHaveBeenCalledWith({
            eventName: "download",
            context: "own_volume",
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

        it('should ignore ValidationError', () => {
            const error = new ValidationError('Validation error');
            downloadTelemetry.downloadFailed(error, 100, 200);
            expect(mockTelemetry.logEvent).not.toHaveBeenCalled();
        });
    
        it('should ignore AbortError', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            downloadTelemetry.downloadFailed(error, 100, 200);
    
            expect(mockTelemetry.logEvent).not.toHaveBeenCalled();
        });

        it('should detect "rate_limited" error for RateLimitedError', () => {
            const error = new RateLimitedError('Rate limited');
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('rate_limited');
        });
    
        it('should detect "decryption_error" for DecryptionError', () => {
            const error = new DecryptionError('Decryption failed');
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('decryption_error');
        });
    
        it('should detect "integrity_error" for IntegrityError', () => {
            const error = new IntegrityError('Integrity check failed');
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('integrity_error');
        });
    
        it('should detect "4xx" error for APIHTTPError with 4xx status code', () => {
            const error = new APIHTTPError('Client error', 404);
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('4xx');
        });
    
        it('should detect "5xx" error for APIHTTPError with 5xx status code', () => {
            const error = new APIHTTPError('Server error', 500);
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('5xx');
        });
    
        it('should detect "server_error" for TimeoutError', () => {
            const error = new Error('Timeout');
            error.name = 'TimeoutError';
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('server_error');
        });
    
        it('should detect "network_error" for NetworkError', () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';
            downloadTelemetry.downloadFailed(error, 100, 200);
            verifyErrorCategory('network_error');
        });
    });
});
