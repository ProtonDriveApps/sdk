export type UploadTuningOptions = {
    encryptionConcurrency: number;
    maxBufferedBlocks: number;
    maxUploadingBlocks: number;
    maxConcurrentFileUploads: number;
    maxConcurrentUploadSizeInBlocks: number;
    useWorkerHashing: boolean;
};
