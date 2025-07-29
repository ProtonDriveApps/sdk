import { DegradedNode, MaybeNode, MetricEvent } from "../interface";
import { LogRecord } from "../telemetry";

export interface Diagnostic {
    verifyMyFiles(options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult>;
    verifyNodeTree(node: MaybeNode, options?: DiagnosticOptions): AsyncGenerator<DiagnosticResult>;
}

export type DiagnosticOptions = {
    verifyContent?: boolean,
    verifyThumbnails?: boolean,
}

export type DiagnosticResult = 
    | FatalErrorResult
    | SdkErrorResult
    | HttpErrorResult
    | DegradedNodeResult
    | UnverifiedAuthorResult
    | ExtendedAttributesErrorResult
    | ExtendedAttributesMissingFieldResult
    | ContentFileMissingRevisionResult
    | ContentIntegrityErrorResult
    | ContentDownloadErrorResult
    | ThumbnailsErrorResult
    | LogErrorResult
    | LogWarningResult
    | MetricResult;

// Event representing that fatal error occurred during the diagnostic.
// This error prevents the diagnostic to finish.
export type FatalErrorResult = {
    type: 'fatal_error',
    message: string,
    error?: unknown,
}

// Event representing that SDK call failed.
// It can be any throwable error from any SDK call. Normally no error should be thrown.
export type SdkErrorResult = {
    type: 'sdk_error',
    call: string,
    error?: unknown,
}

// Event representing that HTTP call failed.
// It can be any call from the SDK, including validation error. Normally no error should be present.
export type HttpErrorResult = {
    type: 'http_error',
    request: {
        url: string,
        method: string,
        json: unknown,
    },
    // Error if the whole call failed (`fetch` failed).
    error?: unknown,
    // Response if the response is not 2xx or 3xx.
    response?: {
        status: number,
        statusText: string,
        // Either json object or error if the response is not JSON.
        json?: object,
        jsonError?: unknown,
    },
}

// Event representing that node has some decryption or other (e.g., invalid name) issues.
export type DegradedNodeResult = {
    type: 'degraded_node',
    nodeUid: string,
    node: DegradedNode,
}

// Event representing that signature verification failing.
export type UnverifiedAuthorResult = {
    type: 'unverified_author',
    nodeUid: string,
    revisionUid?: string,
    authorType: string,
    claimedAuthor?: string,
    error: string,
    node: MaybeNode,
}

// Event representing that field from the extended attributes is not valid format.
// Currently only `sha1` verification is supported.
export type ExtendedAttributesErrorResult = {
    type: 'extended_attributes_error',
    nodeUid: string,
    revisionUid?: string,
    field: 'sha1',
    value: string,
}

// Event representing that field from the extended attributes is missing.
// Currently only `sha1` verification is supported.
export type ExtendedAttributesMissingFieldResult = {
    type: 'extended_attributes_missing_field',
    nodeUid: string,
    revisionUid?: string,
    missingField: 'sha1',
}

// Event representing that file is missing the active revision.
export type ContentFileMissingRevisionResult = {
    type: 'content_file_missing_revision',
    nodeUid: string,
    revisionUid?: string,
}

// Event representing that file content is not valid - either sha1 or size is not correct.
export type ContentIntegrityErrorResult = {
    type: 'content_integrity_error',
    nodeUid: string,
    revisionUid?: string,
    claimedSha1?: string,
    computedSha1?: string,
    claimedSizeInBytes?: number,
    computedSizeInBytes?: number,
}

// Event representing that downloading the file content failed.
// This can be connection issue or server error. If its integrity issue,
// it should be reported as `ContentIntegrityErrorResult`.
export type ContentDownloadErrorResult = {
    type: 'content_download_error',
    nodeUid: string,
    revisionUid?: string,
    error: unknown,
}

// Event representing that getting the thumbnails failed.
// This can be connection issue or server error.
export type ThumbnailsErrorResult = {
    type: 'thumbnails_error',
    nodeUid: string,
    revisionUid?: string,
    message?: string,
    error?: unknown,
}

// Event representing errors logged during the diagnostic.
export type LogErrorResult = {
    type: 'log_error',
    log: LogRecord,
}

// Event representing warnings logged during the diagnostic.
export type LogWarningResult = {
    type: 'log_warning',
    log: LogRecord,
}

// Event representing metrics logged during the diagnostic.
export type MetricResult = {
    type: 'metric',
    event: MetricEvent,
}
