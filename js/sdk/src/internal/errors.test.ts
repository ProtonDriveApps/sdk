import { VERIFICATION_STATUS } from '../crypto';
import { getVerificationMessage } from './errors';

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
