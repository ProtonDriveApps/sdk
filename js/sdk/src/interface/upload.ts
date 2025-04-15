import { Thumbnail } from "./thumbnail";

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
