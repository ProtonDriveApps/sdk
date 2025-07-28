export interface ProtonDriveHTTPClient {
    fetchJson(options: ProtonDriveHTTPClientJsonOptions): Promise<Response>;
    fetchBlob(options: ProtonDriveHTTPClientBlobOptions): Promise<Response>;
}

export type ProtonDriveHTTPClientJsonOptions = ProtonDriveHTTPClientBaseOptions & {
    json?: object,
}

export type ProtonDriveHTTPClientBlobOptions = ProtonDriveHTTPClientBaseOptions & {
    body?: XMLHttpRequestBodyInit,
    onProgress?: (progress: number) => void,
}

type ProtonDriveHTTPClientBaseOptions = {
    url: string,
    method: string,
    headers: Headers,
    /**
     * The timeout in milliseconds.
     *
     * When timeout is reached, the request will be aborted with TimeoutError.
     */
    timeoutMs: number,
    signal?: AbortSignal,
}
