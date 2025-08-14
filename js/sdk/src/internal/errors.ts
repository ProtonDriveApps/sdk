import { c } from 'ttag';

import { VERIFICATION_STATUS } from '../crypto';

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : c('Error').t`Unknown error`;
}

/**
 * @param signatureType - Must be translated before calling this function.
 */
export function getVerificationMessage(
    verified: VERIFICATION_STATUS,
    verificationErrors?: Error[],
    signatureType?: string,
    notAvailableVerificationKeys = false,
): string {
    if (verified === VERIFICATION_STATUS.NOT_SIGNED) {
        return signatureType ? c('Error').t`Missing signature for ${signatureType}` : c('Error').t`Missing signature`;
    }

    if (notAvailableVerificationKeys) {
        return signatureType
            ? c('Error').t`Verification keys for ${signatureType} are not available`
            : c('Error').t`Verification keys are not available`;
    }

    if (verificationErrors) {
        const errorMessage = verificationErrors?.map((e) => e.message).join(', ');
        return signatureType
            ? c('Error').t`Signature verification for ${signatureType} failed: ${errorMessage}`
            : c('Error').t`Signature verification failed: ${errorMessage}`;
    }

    return signatureType
        ? c('Error').t`Signature verification for ${signatureType} failed`
        : c('Error').t`Signature verification failed`;
}
