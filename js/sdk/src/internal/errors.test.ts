import { VERIFICATION_STATUS } from '../crypto';
import { getVerificationMessage } from './errors';

describe('getVerificationMessage', () => {
    const testCases: [VERIFICATION_STATUS, string | undefined, boolean, string][] = [
        [VERIFICATION_STATUS.NOT_SIGNED, 'type', false, 'Missing signature for type'],
        [VERIFICATION_STATUS.NOT_SIGNED, undefined, false, 'Missing signature'],
        [VERIFICATION_STATUS.NOT_SIGNED, 'type', true, 'Missing signature for type'],
        [VERIFICATION_STATUS.NOT_SIGNED, undefined, true, 'Missing signature'],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, 'type', false, 'Signature verification for type failed'],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, undefined, false, 'Signature verification failed'],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, 'type', true, 'Verification keys for type are not available'],
        [VERIFICATION_STATUS.SIGNED_AND_INVALID, undefined, true, 'Verification keys are not available'],
    ];

    for (const [status, type, notAvailable, expected] of testCases) {
        it(`returns correct message for status ${status} with type ${type} and notAvailable ${notAvailable}`, () => {
            expect(getVerificationMessage(status, type, notAvailable)).toBe(expected);
        });
    }
});
