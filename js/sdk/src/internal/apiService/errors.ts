import { ErrorCode } from './errorCodes';

export function apiErrorFactory({ response, result }: { response: Response, result?: unknown }): APIError {
    if (!result) {
        return new APIHTTPError(response.statusText, response.status);
    }

    // @ts-expect-error: Result from API can be any JSON that might not have
    // error or code set which next lines should handle.
    const [code, message] = [result.Code || 0, result.Error || "Unknown error"];
    switch (code) {
        case ErrorCode.NOT_EXISTS:
            return new NotFoundAPIError(message, code);
        default:
            return new APICodeError(message, code);
    }
}

export class APIError extends Error {}

export class APIHTTPError extends APIError {
    public statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export class APICodeError extends APIError {
    public code: number;

    constructor(message: string, code: number) {
        super(message);
        this.code = code;
    }
}

export class NotFoundAPIError extends APICodeError {}
