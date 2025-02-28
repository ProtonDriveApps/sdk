export class AbortError extends Error {
    name = 'AbortError';
}

export class SDKError extends Error {
    name = 'SDKError';
}

export class ValidationError extends SDKError {
    name = 'ValidationError';
}
