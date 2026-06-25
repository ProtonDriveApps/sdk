namespace Proton.Drive.Sdk.Telemetry;

// Numeric values must match the UploadError enum in proton.drive.sdk.proto.
public enum UploadError
{
    ServerError = 0,
    NetworkError = 1,
    IntegrityError = 2,
    RateLimited = 3,
    HttpClientSideError = 4,
    Unknown = 5,
    ValidationError = 6,
}
