export interface ProtonDriveHTTPClient {
    fetch(request: Request, signal?: AbortSignal): Promise<Response>,
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
