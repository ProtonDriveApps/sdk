import { Author, MaybeNode, MetricEvent, NodeType, AnonymousUser } from '../interface';
import { LogRecord } from '../telemetry';

export interface Diagnostic {
    verifyMyFiles(
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult>;
    verifyNodeTree(
        node: MaybeNode,
        options?: DiagnosticOptions,
        onProgress?: DiagnosticProgressCallback,
    ): AsyncGenerator<DiagnosticResult>;
}

export type DiagnosticOptions = {
    verifyContent?: boolean;
    verifyThumbnails?: boolean;
    expectedStructure?: ExcpectedTreeNode;
};

// Tree structure of the expected node tree.
export type ExcpectedTreeNode = {
    name: string;
    expectedSha1?: string;
    expectedSizeInBytes?: number;
    children?: ExcpectedTreeNode[];
};

export type DiagnosticProgressCallback = (progress: {
    allNodesLoaded: boolean;
    loadedNodes: number;
    checkedNodes: number;
}) => void;

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
    | ExpectedStructureMissingNode
    | ExpectedStructureUnexpectedNode
    | ExpectedStructureIntegrityError
    | LogErrorResult
    | LogWarningResult
    | MetricResult;

// Event representing that fatal error occurred during the diagnostic.
// This error prevents the diagnostic to finish.
export type FatalErrorResult = {
    type: 'fatal_error';
    message: string;
    error?: unknown;
};

// Event representing that SDK call failed.
// It can be any throwable error from any SDK call. Normally no error should be thrown.
export type SdkErrorResult = {
    type: 'sdk_error';
    call: string;
    error?: unknown;
};

// Event representing that HTTP call failed.
// It can be any call from the SDK, including validation error. Normally no error should be present.
export type HttpErrorResult = {
    type: 'http_error';
    request: {
        url: string;
        method: string;
        json: unknown;
    };
    // Error if the whole call failed (`fetch` failed).
    error?: unknown;
    // Response if the response is not 2xx or 3xx.
    response?: {
        status: number;
        statusText: string;
        // Either json object or error if the response is not JSON.
        json?: object;
        jsonError?: unknown;
    };
};

// Event representing that node has some decryption or other (e.g., invalid name) issues.
export type DegradedNodeResult = {
    type: 'degraded_node';
} & NodeDetails;

// Event representing that signature verification failing.
export type UnverifiedAuthorResult = {
    type: 'unverified_author';
    authorType: string;
    claimedAuthor?: string | AnonymousUser;
    error: string;
} & NodeDetails;

// Event representing that field from the extended attributes is not valid format.
// Currently only `sha1` verification is supported.
export type ExtendedAttributesErrorResult = {
    type: 'extended_attributes_error';
    field: 'sha1';
    value: string;
} & NodeDetails;

// Event representing that field from the extended attributes is missing.
// Currently only `sha1` verification is supported.
export type ExtendedAttributesMissingFieldResult = {
    type: 'extended_attributes_missing_field';
    missingField: 'sha1';
} & NodeDetails;

// Event representing that file is missing the active revision.
export type ContentFileMissingRevisionResult = {
    type: 'content_file_missing_revision';
} & NodeDetails;

// Event representing that file content is not valid - either sha1 or size is not correct.
export type ContentIntegrityErrorResult = {
    type: 'content_integrity_error';
    claimedSha1?: string;
    computedSha1?: string;
    claimedSizeInBytes?: number;
    computedSizeInBytes?: number;
} & NodeDetails;

// Event representing that downloading the file content failed.
// This can be connection issue or server error. If its integrity issue,
// it should be reported as `ContentIntegrityErrorResult`.
export type ContentDownloadErrorResult = {
    type: 'content_download_error';
    error: unknown;
} & NodeDetails;

// Event representing that getting the thumbnails failed.
// This can be connection issue or server error.
export type ThumbnailsErrorResult = {
    type: 'thumbnails_error';
    error: unknown;
} & NodeDetails;

// Event representing that expected node is missing.
// This will be reported for any node that is not found compared to
// the expected structure.
export type ExpectedStructureMissingNode = {
    type: 'expected_structure_missing_node';
    expectedNode: ExcpectedTreeNode;
    parentNodeUid: string;
};

// Event representing that unexpected node is present.
// This will be reported for any node that is found in the actual structure
// but is not defined in the expected structure.
export type ExpectedStructureUnexpectedNode = {
    type: 'expected_structure_unexpected_node';
} & NodeDetails;

// Event representing that expected node is not matching the actual node.
// This will be reported when claimed and expected values are different.
// It doesn't check the real content - use content verification to verify
// the claimed values with the real content.
export type ExpectedStructureIntegrityError = {
    type: 'expected_structure_integrity_error';
    expectedNode: ExcpectedTreeNode;
    claimedSha1?: string;
    claimedSizeInBytes?: number;
} & NodeDetails;

// Event representing errors logged during the diagnostic.
export type LogErrorResult = {
    type: 'log_error';
    log: LogRecord;
};

// Event representing warnings logged during the diagnostic.
export type LogWarningResult = {
    type: 'log_warning';
    log: LogRecord;
};

// Event representing metrics logged during the diagnostic.
export type MetricResult = {
    type: 'metric';
    event: MetricEvent;
};

export type NodeDetails = {
    safeNodeDetails: {
        nodeUid: string;
        revisionUid?: string;
        nodeType: NodeType;
        nodeCreationTime: Date;
        keyAuthor: Author;
        nameAuthor: Author;
        errors: {
            field: string;
            error: unknown;
        }[];
    };
    sensitiveNodeDetails: MaybeNode;
};
