using System.Net;
using System.Security.Cryptography;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryErrorResolver
{
    public static DownloadError? GetDownloadErrorFromException(Exception exception)
    {
        return exception switch
        {
            // Not reported as download error
            OperationCanceledException => null,
            CompletedDownloadManifestVerificationException => null,

            // Download errors
            NodeKeyAndSessionKeyMismatchException or SessionKeyAndDataPacketMismatchException => DownloadError.IntegrityError,
            FileContentsDecryptionException => DownloadError.DecryptionError,
            CryptographicException => DownloadError.DecryptionError,
            HttpRequestException { HttpRequestError: HttpRequestError.NameResolutionError or HttpRequestError.ConnectionError or HttpRequestError.ProxyTunnelError } => DownloadError.NetworkError,
            HttpRequestException { HttpRequestError: HttpRequestError.InvalidResponse or HttpRequestError.ResponseEnded } => DownloadError.ServerError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.RequestTimeout } => DownloadError.ServerError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => DownloadError.RateLimited,
            ProtonApiException { TransportCode: >= 400 and < 500 } => DownloadError.HttpClientSideError,
            ProtonApiException { TransportCode: >= 500 and < 600 } => DownloadError.ServerError,
            TimeoutException => DownloadError.ServerError,
            _ => DownloadError.Unknown,
        };
    }

    public static UploadError? GetUploadErrorFromException(Exception exception)
    {
        return exception switch
        {
            NodeKeyAndSessionKeyMismatchException or SessionKeyAndDataPacketMismatchException => UploadError.IntegrityError,
            HttpRequestException { HttpRequestError: HttpRequestError.NameResolutionError or HttpRequestError.ConnectionError or HttpRequestError.ProxyTunnelError } => UploadError.NetworkError,
            HttpRequestException { HttpRequestError: HttpRequestError.InvalidResponse or HttpRequestError.ResponseEnded } => UploadError.ServerError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.RequestTimeout } => UploadError.ServerError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => UploadError.RateLimited,
            ProtonApiException { TransportCode: >= 400 and < 500 } => UploadError.HttpClientSideError,
            ProtonApiException { TransportCode: >= 500 and < 600 } => UploadError.ServerError,
            _ => UploadError.Unknown,
        };
    }
}
