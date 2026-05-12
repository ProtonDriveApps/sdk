import { c } from 'ttag';

import { VERIFICATION_STATUS } from '../crypto';
import { AbortError, ConnectionError, RateLimitedError, ValidationError } from '../errors';

export function createErrorFromUnknown(error: unknown): Error {
    return error instanceof Error ? error : new Error(getErrorMessage(error), { cause: error });
}

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

/**
 * Returns true if the error is not an application error (it is for example
 * a network error failing to fetch keys) and can be ignored for telemetry.
 */
export function isNotApplicationError(error?: unknown): boolean {
    // SDK errors.
    if (
        error instanceof AbortError ||
        error instanceof ValidationError ||
        error instanceof RateLimitedError ||
        error instanceof ConnectionError
    ) {
        return true;
    }

    // General errors that can come from the SDK dependencies (notably Account
    // dependency which loads the keys for the crypto services).
    if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'OfflineError' || error.name === 'TimeoutError') {
            return true;
        }
    }

    return false;
}

export function isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    if (
        error.name === 'OfflineError' ||
        error.name === 'NetworkError' ||
        error.message?.toLowerCase() === 'network error' ||
        (error.name === 'TypeError' &&
            ['Failed to fetch', 'NetworkError when attempting to fetch resource', 'Load failed'].includes(
                error.message,
            ))
    ) {
        return true;
    }
    if (errorMessageIndicatesTransientTransportFailure(error.message) || errorHasTransientTransportCode(error)) {
        return true;
    }
    if (error.cause instanceof Error) {
        return (
            errorMessageIndicatesTransientTransportFailure(error.cause.message) ||
            errorHasTransientTransportCode(error.cause)
        );
    }
    return false;
}

function errorMessageIndicatesTransientTransportFailure(message: string | undefined): boolean {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return (
        // Remote end closed TLS/TCP without a complete response.
        lower.includes('socket connection was closed unexpectedly') ||
        // Remote end sent RST or closed the write side mid-request.
        lower.includes('other side closed') ||
        // Remote end closed the socket abruptly.
        lower.includes('socket hang up')
    );
}

function errorHasTransientTransportCode(error: Error): boolean {
    const code = (error as NodeJS.ErrnoException).code;
    return (
        // TCP RST or equivalent: common under flaky networks or after server restart.
        code === 'ECONNRESET' ||
        // Writing to a socket whose other end is gone (often grouped with reset/hang-up).
        code === 'EPIPE' ||
        // Socket-level failure after connect (e.g. unexpected close on the wire).
        code === 'UND_ERR_SOCKET'
    );
}
