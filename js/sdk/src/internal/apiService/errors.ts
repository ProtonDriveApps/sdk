import { ErrorCode } from './errorCodes';

export function apiErrorFactory({ response, result }: { response: Response, result?: any }): APIError {
    if (!result) {
        return new APIHTTPError(response.statusText, response.status);
    }

    const code = result.Code;
    const message = result.Error;
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
