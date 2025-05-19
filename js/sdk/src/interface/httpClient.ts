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
    signal?: AbortSignal,
}

export type ProtonDriveConfig = {
    /**
     * The base URL for the Proton Drive (without schema).
     *
     * If not provided, defaults to 'drive-api.proton.me'.
     */
    baseUrl?: string,

    /**
     * The language to use for error messages.
     *
     * If not provided, defaults to 'en'.
     */
    language?: string,
}
