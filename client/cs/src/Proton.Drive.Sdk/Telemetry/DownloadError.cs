namespace Proton.Drive.Sdk.Telemetry;

// Numeric values must match the DownloadError enum in proton.drive.sdk.proto.
public enum DownloadError
{
    ServerError = 0,
    NetworkError = 1,
    DecryptionError = 2,
    IntegrityError = 3,
    RateLimited = 4,
    HttpClientSideError = 5,
    Unknown = 6,
    ValidationError = 7,
}
