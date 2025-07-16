import { Thumbnail } from "./thumbnail";

export type UploadMetadata = {
    mediaType: string,
    /**
     * Expected size of the file.
     *
     * The file size is used to verify the integrity of the file during upload.
     * If the expected size does not match the actual size, the upload will
     * fail.
     */
    expectedSize: number,
    /**
     * Modification time of the file.
     *
     * The modification time will be encrypted and stored with the file.
     */
    modificationTime?: Date,
    /**
     * Additional metadata to be stored with the file.
     *
     * These metadata must be object that can be serialized to JSON.
     *
     * The metadata will be encrypted and stored with the file.
     */
    additionalMetadata?: object,
};

export interface FileRevisionUploader {
    /**
     * Uploads a file from a stream.
     *
     * The function will resolve to a controller that can be used to pause,
     * resume and complete the upload.
     *
     * The function will reject if the node with the given name already exists.
     */
    writeStream(stream: ReadableStream, thumnbails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): Promise<UploadController>,

    /**
     * Uploads a file from a file object. It is convenient to use this method
     * when the file is already in memory. The file object is used to get the
     * metadata, such as the media type, size or modification time.
     *
     * The function will resolve to a controller that can be used to pause,
     * resume and complete the upload.
     *
     * The function will reject if the node with the given name already exists.
     */
    writeFile(fileObject: File, thumnbails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): Promise<UploadController>,
}

export interface FileUploader extends FileRevisionUploader {
    /**
     * Returns the available name for the file.
     *
     * The function will return a name that includes the original name with the
     * available index. The name is guaranteed to be unique in the parent folder.
     *
     * Example new name: `file (2).txt`.
     */
    getAvailableName(): Promise<string>,
}

export interface UploadController {
    pause(): void,
    resume(): void,
    completion(): Promise<string>,
}
