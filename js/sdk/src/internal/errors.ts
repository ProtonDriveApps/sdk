import { c } from 'ttag';

import { VERIFICATION_STATUS } from "../crypto";

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : c('Error').t`Unknown error`;
}

/**
 * @param signatureType - Must be translated before calling this function.
 */
export function getVerificationMessage(verified: VERIFICATION_STATUS, signatureType?: string): string {
    if (signatureType) {
        return verified === VERIFICATION_STATUS.SIGNED_AND_INVALID
            ? c('Error').t`Signature verification for ${signatureType} failed`
            : c('Error').t`Missing signature for ${signatureType}`;
    }

    return verified === VERIFICATION_STATUS.SIGNED_AND_INVALID
        ? c('Error').t`Signature verification failed`
        : c('Error').t`Missing signature`;
}
