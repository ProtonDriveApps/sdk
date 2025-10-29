import { VERIFICATION_STATUS } from '../crypto';
import { AbortError, ConnectionError, RateLimitedError, ValidationError } from '../errors';
import { getVerificationMessage, isNotApplicationError } from './errors';

describe('getVerificationMessage', () => {
    const testCases: [VERIFICATION_STATUS, Error[] | undefined, string | undefined, boolean, string][] = [
        [VERIFICATION_STATUS.NOT_SIGNED, undefined, 'type', false, 'Missing signature for type'],
        [VERIFICATION_STATUS.NOT_SIGNED, undefined, undefined, false, 'Missing signature'],
        [VERIFICATION_STATUS.NOT_SIGNED, undefined, 'type', true, 'Missing signature for type'],
        [VERIFICATION_STATUS.NOT_SIGNED, undefined, undefined, true, 'Missing signature'],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, undefined, 'type', false, 'Signature verification for type failed'],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, undefined, undefined, false, 'Signature verification failed'],
        [
            VERIFICATION_STATUS.SIGNED_AND_INVALID,
            undefined,
            'type',
            true,
            'Verification keys for type are not available',
        ],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, undefined, undefined, true, 'Verification keys are not available'],
        [
            VERIFICATION_STATUS.SIGNED_AND_INVALID,
            [new Error('error1'), new Error('error2')],
            undefined,
            false,
            'Signature verification failed: error1, error2',
        ],
        [
            VERIFICATION_STATUS.SIGNED_AND_INVALID,
            [new Error('error1'), new Error('error2')],
            'type',
            false,
            'Signature verification for type failed: error1, error2',
        ],
        [
            VERIFICATION_STATUS.SIGNED_AND_INVALID,
            [new Error('error1'), new Error('error2')],
            undefined,
            true,
            'Verification keys are not available',
        ],
        [
            VERIFICATION_STATUS.SIGNED_AND_INVALID,
            [new Error('error1'), new Error('error2')],
            'type',
            true,
            'Verification keys for type are not available',
        ],
    ];

    for (const [status, errors, type, notAvailable, expected] of testCases) {
        it(`returns correct message for status ${status} with type ${type} and notAvailable ${notAvailable}`, () => {
            expect(getVerificationMessage(status, errors, type, notAvailable)).toBe(expected);
        });
    }
});

describe('isNotApplicationError', () => {
    describe('SDK errors that should be ignored', () => {
        it('returns true for AbortError', () => {
            const error = new AbortError('Operation aborted');
            expect(isNotApplicationError(error)).toBe(true);
        });

        it('returns true for ValidationError', () => {
            const error = new ValidationError('Validation failed');
            expect(isNotApplicationError(error)).toBe(true);
        });

        it('returns true for RateLimitedError', () => {
            const error = new RateLimitedError('Rate limited');
            expect(isNotApplicationError(error)).toBe(true);
        });

        it('returns true for ConnectionError', () => {
            const error = new ConnectionError('Connection failed');
            expect(isNotApplicationError(error)).toBe(true);
        });
    });

    describe('General errors with specific names that should be ignored', () => {
        it('returns true for Error with name AbortError', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            expect(isNotApplicationError(error)).toBe(true);
        });

        it('returns true for Error with name OfflineError', () => {
            const error = new Error('Offline');
            error.name = 'OfflineError';
            expect(isNotApplicationError(error)).toBe(true);
        });

        it('returns true for Error with name TimeoutError', () => {
            const error = new Error('Timeout');
            error.name = 'TimeoutError';
            expect(isNotApplicationError(error)).toBe(true);
        });
    });

    describe('Errors that should not be ignored', () => {
        it('returns false for regular Error', () => {
            const error = new Error('Regular error');
            expect(isNotApplicationError(error)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(isNotApplicationError(undefined)).toBe(false);
        });

        it('returns false for non-Error object', () => {
            const error = { message: 'Not an error' };
            expect(isNotApplicationError(error)).toBe(false);
        });
    });
});
