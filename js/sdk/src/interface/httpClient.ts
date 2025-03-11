export interface ProtonDriveHTTPClient {
    fetch(request: Request, signal?: AbortSignal): Promise<Response>,
}

export type ProtonDriveConfig = {
    baseUrl?: string,
    language?: string,
    uploadTimeout?: number,
    uploadQueueLimitItems?: number,
    downloadTimeout?: number,
    downloadQueueLimitItems?: number,
}
