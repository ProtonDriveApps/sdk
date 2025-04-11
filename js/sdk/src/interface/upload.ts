import { NodeOrUid } from './nodes';

export interface Upload {
    getFileUploader(
        parentFolder: NodeOrUid,
        name: string,
        metadata: UploadMetadata,
        signal?: AbortSignal
    ): Promise<Fileuploader>,

    getFileRevisionUploader(
        node: NodeOrUid,
        metadata: UploadMetadata,
        signal?: AbortSignal
    ): Promise<Fileuploader>,
}

export type UploadMetadata = {
    mimeType: string,
    expectedSize: number,
    modificationTime?: Date,
    additionalMetadata?: object,
};

export interface Fileuploader {
    writeStream(stream: ReadableStream, thumnbails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): UploadController,
    writeFile(fileObject: File, thumnbails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): UploadController,
}

export interface UploadController {
    pause(): void,
    resume(): void,
    completion(): Promise<string>,
}

export type Thumbnail = {
    type: ThumbnailType,
    thumbnail: Uint8Array,
}

export enum ThumbnailType {
    Type1 = 1,
    Type2 = 2,
}
