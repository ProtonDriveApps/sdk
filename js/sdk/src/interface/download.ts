export interface FileDownloader {
    /**
     * Get the claimed size of the file in bytes.
     *
     * This provides total clear-text size of the file. This is encrypted
     * information that is not known to the Proton Drive and thus it is
     * explicitely stated as claimed only and must be treated that way.
     * It can be wrong or missing completely.
     */
    getClaimedSizeInBytes(): number | undefined;

    /**
     * Download, decrypt and verify the content from the server and write
     * to the provided stream.
     *
     * @param onProgress - Callback that is called with the number of downloaded bytes
     */
    downloadToStream(streamFactory: WritableStream, onProgress?: (downloadedBytes: number) => void): DownloadController;

    /**
     * Same as `downloadToStream` but without verification checks.
     *
     * Use this only for debugging purposes.
     */
    unsafeDownloadToStream(
        streamFactory: WritableStream,
        onProgress?: (downloadedBytes: number) => void,
    ): DownloadController;

    /**
     * Get a seekable stream that can be used to download specific range of
     * data from the file. This is useful for video players to download the
     * next several bytes of the video, or skip to the middle without the
     * need to download the entire file.
     *
     * Stream doesn't verify data integrity. For the full integrity of
     * the file, use `downloadToStream` instead.
     *
     * The stream is not opportunitistically downloading the data ahead of
     * the time. It will only download the data when it is requested. To
     * provide smooth experience, pre-buffer the data based on the expected
     * playback speed.
     *
     * The file is chunked into blocks that must be fully downloaded to provide
     * given range of data within the block. To avoid downloading the same
     * block multiple times, a few blocks can be cached. The size of the cache
     * might change in the future to improve performance.
     *
     * Example:
     *
     * ```ts
     * const seekableStream = fileDownloader.getSeekableStream();
     * await seekableStream.seek(1000);
     * const { value, done } = await seekableStream.read(100);
     * ```
     */
    getSeekableStream(): SeekableReadableStream;
}

export interface DownloadController {
    pause(): void;
    resume(): void;
    completion(): Promise<void>;
}

export interface SeekableReadableStream extends ReadableStream<Uint8Array> {
    /**
     * Read a specific number of bytes from the stream at the current position.
     *
     * @param numBytes - The number of bytes to read.
     * @returns A promise that resolves to the read bytes.
     */
    read(numBytes: number): Promise<{ value: Uint8Array; done: boolean }>;

    /**
     * Seek to the given position in the stream from the beginning of the stream.
     *
     * @param position - The position to seek to in bytes.
     */
    seek(position: number): void | Promise<void>;
}
