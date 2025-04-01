import { c } from 'ttag';

import { ServerError, ValidationError } from '../../errors';
import { ErrorCode, HTTPErrorCode } from './errorCodes';

export function apiErrorFactory({ response, result }: { response: Response, result?: unknown }): ServerError {
    // Backend responses with 404 both in the response and body code.
    // In such a case we want to stick to APIHTTPError to be very clear
    // it is not NotFoundAPIError.
    if (response.status === HTTPErrorCode.NOT_FOUND || !result) {
        return new APIHTTPError(response.statusText, response.status);
    }

    // @ts-expect-error: Result from API can be any JSON that might not have
    // error or code set which next lines should handle.
    const [code, message] = [result.Code || 0, result.Error || c('Error').t`Unknown error`];
    switch (code) {
        case ErrorCode.NOT_EXISTS:
            return new NotFoundAPIError(message, code);
        // ValidationError should be only when it is clearly user input error,
        // otherwise it should be ServerError.
        // Here we convert only general enough codes. Specific cases that are
        // not clear from the code itself must be handled by each module
        // separately.
        case ErrorCode.NOT_ENOUGH_PERMISSIONS:
        case ErrorCode.NOT_ENOUGH_PERMISSIONS_TO_GRANT_PERMISSIONS:
        case ErrorCode.ALREADY_EXISTS:
        case ErrorCode.INSUFFICIENT_QUOTA:
        case ErrorCode.INSUFFICIENT_SPACE:
        case ErrorCode.MAX_FILE_SIZE_FOR_FREE_USER:
        case ErrorCode.MAX_PUBLIC_EDIT_MODE_FOR_FREE_USER:
        case ErrorCode.INSUFFICIENT_VOLUME_QUOTA:
        case ErrorCode.INSUFFICIENT_DEVICE_QUOTA:
        case ErrorCode.ALREADY_MEMBER_OF_SHARE_IN_VOLUME_WITH_ANOTHER_ADDRESS:
        case ErrorCode.TOO_MANY_CHILDREN:
        case ErrorCode.NESTING_TOO_DEEP:
        case ErrorCode.INSUFFICIENT_INVITATION_QUOTA:
        case ErrorCode.INSUFFICIENT_SHARE_QUOTA:
        case ErrorCode.INSUFFICIENT_SHARE_JOINED_QUOTA:
        case ErrorCode.INSUFFICIENT_BOOKMARKS_QUOTA:
            return new ValidationError(message, code);
        default:
            return new APICodeError(message, code);
    }
}

export class APIHTTPError extends ServerError {
    name = 'APIHTTPError';

    public readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export class APICodeError extends ServerError {
    name = 'APICodeError';

    public readonly code: number;

    constructor(message: string, code: number) {
        super(message);
        this.code = code;
    }
}

export class NotFoundAPIError extends APICodeError {
    name = 'NotFoundAPIError';
}
