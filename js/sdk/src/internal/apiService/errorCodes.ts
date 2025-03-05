export const enum HTTPErrorCode {
    OK = 200,
    TOO_MANY_REQUESTS = 429,
    INTERNAL_SERVER_ERROR = 500,
}

export function isCodeOk(code: number): boolean {
    return code === ErrorCode.OK || code === ErrorCode.OK_MANY || code === ErrorCode.OK_ASYNC;
}

export const enum ErrorCode {
    NOT_FOUND = 404,
    OK = 1000,
    OK_MANY = 1001,
    OK_ASYNC = 1002,
    NOT_EXISTS = 2501,
}
