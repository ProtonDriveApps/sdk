import { NodeOrUid } from './nodes.js';
import { ThumbnailType } from './upload.js';

export interface Download {
    getFileDownloader(node: NodeOrUid, signal?: AbortSignal): Promise<FileDownloader>,

    iterateThumbnails(nodeUids: NodeOrUid[], thumbnailType: ThumbnailType, signal?: AbortSignal): AsyncGenerator<{
        nodeUid: string,
        thumbnail: Uint8Array,
    }>,
}

export interface FileDownloader {
    getClaimedSizeInBytes(): number | undefined,
    writeToStream(streamFactory: WritableStream, onProgress: (writtenBytes: number) => void): DownloadController,
    unsafeWriteToStream(streamFactory: WritableStream, onProgress: (writtenBytes: number) => void): DownloadController,
}

export interface DownloadController {
    pause(): void,
    resume(): void,
    completion(): Promise<void>,
}
