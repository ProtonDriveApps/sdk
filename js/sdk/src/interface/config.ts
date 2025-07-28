export type ProtonDriveConfig = {
    /**
     * The base URL for the Proton Drive (without schema).
     *
     * If not provided, defaults to 'drive-api.proton.me'.
     */
    baseUrl?: string,

    /**
     * The language to use for error messages.
     *
     * If not provided, defaults to 'en'.
     */
    language?: string,

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
    clientUid?: string,
}
