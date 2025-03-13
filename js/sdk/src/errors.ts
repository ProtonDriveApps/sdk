/**
 * Base class for all SDK errors.
 * 
 * This class can be used for catching all SDK errors. The error should have
 * translated message in the `message` property that should be shown to the
 * user without any modification.
 * 
 * No retries should be done as that is already handled by the SDK.
 * 
 * When SDK throws an error and it is not `SDKError`, it is unhandled error
 * by the SDK and usually indicates bug in the SDK. Please, report it.
 */
export class SDKError extends Error {
    name = 'SDKError';
}

/**
 * Error thrown when the operation is aborted.
 * 
 * This error is thrown when the operation is aborted by the user.
 * For example, by calling `abort()` on the `AbortSignal`.
 */
export class AbortError extends SDKError {
    name = 'AbortError';
}

/**
 * Error thrown when the validation fails.
 * 
 * This error is thrown when the validation of the input fails.
 * Validation can be done on the client side or on the server side.
 *
 * For example, on the client, it can be thrown when the node name doesn't
 * follow the required format, etc., while on the server side, it can be thrown
 * when there is not enough permissions, etc.
 */
export class ValidationError extends SDKError {
    name = 'ValidationError';

    /**
     * Internal API code.
     * 
     * Use only for debugging purposes.
     */
    public readonly code?: number;

    constructor(message: string, code?: number) {
        super(message);
        this.code = code;
    }
}

/**
 * Error thrown when the API call fails.
 * 
 * This error covers both HTTP errors and API errors. SDK automatically
 * retries the request before the error is thrown. The sepcific algorithm
 * used for retries depends on the type of the error.
 * 
 * Client should not retry the request when this error is thrown.
 */
export class ServerError extends SDKError {
    name = 'ServerError';

    /**
     * HTTP status code of the response.
     * 
     * Use only for debugging purposes.
     */
    public readonly statusCode?: number;
    /**
     * Internal API code.
     * 
     * Use only for debugging purposes.
     */
    public readonly code?: number;
}

/**
 * Error thrown when the client makes too many requests to the API.
 * 
 * SDK is configured to stay below the rate limits, but it can still happen if
 * client is running multiple SDKs in parallel, or if the rate limits are
 * changed on the server side.
 * 
 * SDK automatically retries the request before the error is thrown after
 * waiting for the required time specified by the server.
 * 
 * Client should slow down calling SDK when this error is thrown.
 * 
 * You can be also notified about the rate limits by the `speedLimited` event.
 * See `onMessage` method on the SDK class for more details.
 */
export class RateLimitedError extends ServerError {
    name = 'RateLimitedError';

    code = 429;
}

/**
 * Error thrown when the client is not connected to the internet.
 * 
 * Client should check the internet connection when this error is thrown.
 * 
 * You can also be notified about the connection status by the `offline` event
 * See `onMessage` method on the SDK class for more details.
 */
export class ConnectionError extends SDKError {
    name = 'ConnectionError';
}
