import { Thumbnail } from './thumbnail';

export type UploadMetadata = {
    mediaType: string;
    /**
     * Expected size of the file.
     *
     * The file size is used to verify the integrity of the file during upload.
     * If the expected size does not match the actual size, the upload will
     * fail.
     */
    expectedSize: number;
    /**
     * Expected SHA1 hash of the file content.
     *
     * If provided, the SDK will verify that the SHA1 hash of the uploaded
     * content matches the expected SHA1 hash. If the hashes do not match,
     * the upload will fail with an IntegrityError.
     *
     * The hash should be provided as a hexadecimal string (40 characters).
     */
    expectedSha1?: string;
    /**
     * Modification time of the file.
     *
     * The modification time will be encrypted and stored with the file.
     */
    modificationTime?: Date;
    /**
     * Additional metadata to be stored with the file.
     *
     * These metadata must be object that can be serialized to JSON.
     *
     * The metadata will be encrypted and stored with the file.
     */
    additionalMetadata?: object;
    /**
     * If there is an existing draft by another client, the upload will be
     * rejected. If user decides to override the existing draft and continue
     * with the upload, set this to true.
     */
    overrideExistingDraftByOtherClient?: boolean;
};

export interface FileUploader {
    /**
     * Uploads a file from a stream.
     *
     * The function will resolve to a controller that can be used to pause,
     * resume and complete the upload.
     *
     * The function will reject if the node with the given name already exists.
     */
    uploadFromStream(
        stream: ReadableStream,
        thumnbails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<UploadController>;

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
    uploadFromFile(
        fileObject: File,
        thumnbails: Thumbnail[],
        onProgress?: (uploadedBytes: number) => void,
    ): Promise<UploadController>;
}

export interface UploadController {
    pause(): void;
    resume(): void;
    completion(): Promise<{ nodeRevisionUid: string, nodeUid: string }>;
}
