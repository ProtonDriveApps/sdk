struct ProtonDriveConfig {
    /// The base URL for the Proton Drive (without schema).
    ///
    /// If not provided, defaults to 'drive-api.proton.me'.
    base_url: &'static str,

    /// The language to use for error messages.
    ///
    /// If not provided, defaults to 'en'.
    language: &'static str,

    /// Client UID is used to identify the client for the upload.
    ///
    /// If the upload failed because of the existing draft, the SDK will automatically clean up the
    /// existing draft and start a new upload. If the client UID doesn't match, the SDK throws, and
    /// then you need to explicitly ask the user to override the existing draft. You can force the
    /// upload by setting up `overrideExistingDraftByOtherClient` to true.
    client_uuid: &'static str,
}

impl Default for ProtonDriveConfig {
    fn default() -> Self {
        ProtonDriveConfig {
            base_url: "drive-api.proton.me",
            language: "en",
            client_uuid: "",
        }
    }
}