using System.Net;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryErrorResolver
{
    public static UploadError? GetUploadErrorFromException(Exception exception)
    {
        return exception switch
        {
            NodeKeyAndSessionKeyMismatchException or SessionKeyAndDataPacketMismatchException => UploadError.IntegrityError,
            HttpRequestException { HttpRequestError: HttpRequestError.ConnectionError } => UploadError.NetworkError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => UploadError.RateLimited,
            ProtonApiException { TransportCode: >= 400 and < 500 } => UploadError.HttpClientSideError,
            ProtonApiException { TransportCode: >= 500 and < 600 } => UploadError.ServerError,
            _ => UploadError.Unknown,
        };
    }
}
