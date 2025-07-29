export interface FileDownloader {
    /**
     * Get the claimed size of the file in bytes.
     * 
     * This provides total clear-text size of the file. This is encrypted
     * information that is not known to the Proton Drive and thus it is
     * explicitely stated as claimed only and must be treated that way.
     * It can be wrong or missing completely.
     */
    getClaimedSizeInBytes(): number | undefined,

    /**
     * Download, decrypt and verify the content from the server and write
     * to the provided stream.
     * 
     * @param onProgress - Callback that is called with the number of downloaded bytes
     */
    writeToStream(streamFactory: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController,

    /**
     * Same as `writeToStream` but without verification checks.
     * 
     * Use this only for debugging purposes.
     */
    unsafeWriteToStream(streamFactory: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController,
}

export interface DownloadController {
    pause(): void,
    resume(): void,
    completion(): Promise<void>,
}
