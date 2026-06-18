namespace Proton.Drive.Sdk.Telemetry;

public enum UploadError
{
    ServerError,
    NetworkError,
    IntegrityError,
    RateLimited,
    ValidationError,
    HttpClientSideError,
    Unknown,
}
