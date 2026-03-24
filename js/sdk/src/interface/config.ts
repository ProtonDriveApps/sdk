export type ProtonDriveConfig = {
    /**
     * The base URL for the Proton Drive (without schema).
     *
     * If not provided, defaults to 'drive-api.proton.me'.
     */
    baseUrl?: string;

    /**
     * The language to use for error messages.
     *
     * If not provided, defaults to 'en'.
     */
    language?: string;

    /**
     * Client UID is used to identify the client for the upload.
     *
     * If the upload failed because of the existing draft, the SDK will
     * automatically clean up the existing draft and start a new upload.
     * If the client UID doesn't match, the SDK throws and then you need
     * to explicitely ask the user to override the existing draft.
     *
     * You can force the upload by setting up
     * `overrideExistingDraftByOtherClient` to true.
     */
    clientUid?: string;

    /**
     * Upload performance tuning options.
     *
     * These options allow balancing throughput, memory footprint,
     * and CPU usage for upload-heavy environments.
     */
    upload?: {
        /**
         * Maximum number of file block encryptions performed in parallel.
         *
         * Defaults to an auto value derived from available CPU cores.
         */
        encryptionConcurrency?: number;

        /**
         * Maximum number of encrypted blocks buffered in memory before upload.
         */
        maxBufferedBlocks?: number;

        /**
         * Maximum number of encrypted blocks uploaded concurrently per file.
         */
        maxUploadingBlocks?: number;

        /**
         * Maximum number of files uploading concurrently.
         */
        maxConcurrentFileUploads?: number;

        /**
         * Maximum total in-flight expected upload size in block units.
         *
         * Value is multiplied by the SDK file chunk size.
         */
        maxConcurrentUploadSizeInBlocks?: number;

        /**
         * Enables dedicated worker-based SHA1 hashing when supported.
         *
         * Falls back to main-thread hashing when workers are not available.
         */
        useWorkerHashing?: boolean;

        /**
         * Desired worker-pool size for the provided OpenPGP crypto module.
         *
         * Applied only when the crypto module exposes a compatible runtime hook.
         */
        cryptoWorkerPoolSize?: number;
    };
};
