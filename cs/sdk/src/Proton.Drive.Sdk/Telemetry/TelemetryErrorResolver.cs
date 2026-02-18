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
            // Reported as download success
            CompletedDownloadManifestVerificationException => null,
            DataIntegrityException => exception.GetBaseException() is CompletedDownloadManifestVerificationException ? null : DownloadError.IntegrityError,

            // Download errors
            NodeKeyAndSessionKeyMismatchException or SessionKeyAndDataPacketMismatchException => DownloadError.IntegrityError,
            FileContentsDecryptionException => DownloadError.DecryptionError,
            CryptographicException => DownloadError.DecryptionError,

#pragma warning disable RCS0056 // Line too long
            HttpRequestException { HttpRequestError: HttpRequestError.NameResolutionError or HttpRequestError.ConnectionError or HttpRequestError.ProxyTunnelError } => DownloadError.NetworkError,
#pragma warning restore RCS0056
            HttpRequestException { HttpRequestError: HttpRequestError.InvalidResponse or HttpRequestError.ResponseEnded } => DownloadError.ServerError,
            HttpRequestException { StatusCode: HttpStatusCode.RequestTimeout } => DownloadError.ServerError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)400 and < (HttpStatusCode)500 } => DownloadError.HttpClientSideError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)500 and < (HttpStatusCode)600 } => DownloadError.ServerError,

            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => DownloadError.RateLimited,
            ProtonApiException { TransportCode: >= 400 and < 500 } => DownloadError.HttpClientSideError,

            // TODO: How to better distinguish network errors, that were subject to retry in the HTTP request handler, but resulted in TimeoutException?
            TimeoutException => DownloadError.ServerError,
            _ => DownloadError.Unknown,
        };
    }

    public static UploadError? GetUploadErrorFromException(Exception exception)
    {
        return exception switch
        {
            // Upload errors
            NodeKeyAndSessionKeyMismatchException or SessionKeyAndDataPacketMismatchException => UploadError.IntegrityError,

#pragma warning disable RCS0056 // Line too long
            HttpRequestException { HttpRequestError: HttpRequestError.NameResolutionError or HttpRequestError.ConnectionError or HttpRequestError.ProxyTunnelError } => UploadError.NetworkError,
#pragma warning restore RCS0056
            HttpRequestException { HttpRequestError: HttpRequestError.InvalidResponse or HttpRequestError.ResponseEnded } => UploadError.ServerError,
            HttpRequestException { StatusCode: HttpStatusCode.RequestTimeout } => UploadError.ServerError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)400 and < (HttpStatusCode)500 } => UploadError.HttpClientSideError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)500 and < (HttpStatusCode)600 } => UploadError.ServerError,

            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => UploadError.RateLimited,
            ProtonApiException { TransportCode: >= 400 and < 500 } => UploadError.HttpClientSideError,

            // TODO: How to better distinguish network errors, that were subject to retry in the HTTP request handler, but resulted in TimeoutException?
            TimeoutException => UploadError.ServerError,
            _ => UploadError.Unknown,
        };
    }
}
