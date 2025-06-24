import { c } from 'ttag';

import { ServerError, ValidationError } from '../../errors';
import { ErrorCode, HTTPErrorCode } from './errorCodes';

export function apiErrorFactory({ response, result }: { response: Response, result?: unknown }): ServerError {
    // Backend responses with 404 both in the response and body code.
    // In such a case we want to stick to APIHTTPError to be very clear
    // it is not NotFoundAPIError.
    if (response.status === HTTPErrorCode.NOT_FOUND || !result) {
        return new APIHTTPError(response.statusText || c('Error').t`Unknown error`, response.status);
    }

    const typedResult = result as {
        Code?: number;
        Error?: string;
        Details?: object;
        exception?: string;
        message?: string;
        file?: string;
        line?: number;
        trace?: object;
    };

    const [code, message, details] = [typedResult.Code || 0, typedResult.Error || c('Error').t`Unknown error`, typedResult.Details];

    const debug = typedResult.exception ? {
        exception: typedResult.exception,
        message: typedResult.message,
        file: typedResult.file,
        line: typedResult.line,
        trace: typedResult.trace,
    } : undefined;

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
            return new ValidationError(message, code, details);
        default:
            return new APICodeError(message, code, debug);
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

    public readonly debug?: object;

    constructor(message: string, code: number, debug?: object) {
        super(message);
        this.code = code;
        this.debug = debug;
    }
}

export class NotFoundAPIError extends APICodeError {
    name = 'NotFoundAPIError';
}
