export interface ProtonDriveHTTPClient {
    fetchJson(request: ProtonDriveHTTPClientJsonRequest): Promise<Response>;
    fetchBlob(request: ProtonDriveHTTPClientBlobRequest): Promise<Response>;
}

export type ProtonDriveHTTPClientJsonRequest = ProtonDriveHTTPClientBaseRequest & {
    json?: object;
};

export type ProtonDriveHTTPClientBlobRequest = ProtonDriveHTTPClientBaseRequest & {
    body?: XMLHttpRequestBodyInit;
    onProgress?: (progress: number) => void;
};

type ProtonDriveHTTPClientBaseRequest = {
    url: string;
    method: string;
    headers: Headers;
    /**
     * The timeout in milliseconds.
     *
     * When timeout is reached, the request will be aborted with TimeoutError.
     */
    timeoutMs: number;
    signal?: AbortSignal;
};
