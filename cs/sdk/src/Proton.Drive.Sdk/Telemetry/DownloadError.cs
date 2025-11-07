namespace Proton.Drive.Sdk.Telemetry;

public enum DownloadError
{
    ServerError,
    NetworkError,
    DecryptionError,
    IntegrityError,
    RateLimited,
    HttpClientSideError,
    Unknown,
}
