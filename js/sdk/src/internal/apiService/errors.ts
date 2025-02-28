import { ErrorCode } from './errorCodes';

export function apiErrorFactory({ response, result }: { response: Response, result?: unknown }): APIError {
    if (!result) {
        return new APIHTTPError(response.statusText, response.status);
    }

    // @ts-expect-error: Result from API can be any JSON that might not have
    // error or code set which next lines should handle.
    const [code, message] = [result.Code || 0, result.Error || "Unknown error"];
    switch (code) {
        // Backend doesn't return 404 for not found resources, this is only
        // when the API endpoint is not found. Lets add the URL in the error
        // message so we can debug it easier.
        case ErrorCode.NOT_FOUND:
            return new NotFoundAPIError(`${message}: ${response.url}`, code);
        case ErrorCode.NOT_EXISTS:
            return new NotFoundAPIError(message, code);
        default:
            return new APICodeError(message, code);
    }
}

export class AbortError extends Error {
    name = 'AbortError';
}

export class APIError extends Error {
    name = 'APIError';
}

export class APIHTTPError extends APIError {
    name = 'APIHTTPError';

    public statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export class APICodeError extends APIError {
    name = 'APICodeError';

    public code: number;

    constructor(message: string, code: number) {
        super(message);
        this.code = code;
    }
}

export class NotFoundAPIError extends APICodeError {
    name = 'NotFoundAPIError';
}
