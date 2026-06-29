using System.Net;
using System.Security.Cryptography;
using Proton.Drive.Sdk.Http;
using Proton.Drive.Sdk.Nodes.Download;
using Proton.Drive.Sdk.Nodes.Upload;
using Proton.Drive.Sdk.Nodes.Upload.Verification;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Telemetry;

internal static class TelemetryErrorResolver
{
    public static DownloadError? GetDownloadErrorFromException(Exception exception)
    {
        return exception switch
        {
            ValidationException => DownloadError.ValidationError,

            // Reported as download success
            CompletedDownloadManifestVerificationException => null,
            DataIntegrityException => exception.GetBaseException() is CompletedDownloadManifestVerificationException ? null : DownloadError.IntegrityError,

            // Download errors
            NodeKeyAndSessionKeyMismatchException or SessionKeyAndDataPacketMismatchException => DownloadError.IntegrityError,
            FileContentsDecryptionException => DownloadError.DecryptionError,
            CryptographicException => DownloadError.DecryptionError,

            HttpRequestException { HttpRequestError: HttpRequestError.InvalidResponse or HttpRequestError.ResponseEnded } => DownloadError.ServerError,
            HttpRequestException { StatusCode: HttpStatusCode.RequestTimeout } => DownloadError.ServerError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)StatusCodes.MinClientErrorCode and <= (HttpStatusCode)StatusCodes.MaxClientErrorCode } =>
                DownloadError.HttpClientSideError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)StatusCodes.MinServerErrorCode and <= (HttpStatusCode)StatusCodes.MaxServerErrorCode } =>
                DownloadError.ServerError,
            HttpRequestException => DownloadError.NetworkError,

            ProtonApiException { Code: var code } when ValidationResponseCode.IsValidationCode(code) => DownloadError.ValidationError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => DownloadError.RateLimited,
            ProtonApiException { TransportCode: >= StatusCodes.MinClientErrorCode and <= StatusCodes.MaxClientErrorCode } => DownloadError.HttpClientSideError,
            ProtonApiException { TransportCode: >= StatusCodes.MinServerErrorCode and <= StatusCodes.MaxServerErrorCode } => DownloadError.ServerError,

            // TODO: How to better distinguish network errors, that were subject to retry in the HTTP request handler, but resulted in TimeoutException?
            TimeoutException => DownloadError.ServerError,

            // Windows client specific HTTP request handler errors
            // TODO: The injected HTTP client should provide error categorization, at least for its own specific errors
            Polly.CircuitBreaker.BrokenCircuitException => DownloadError.NetworkError,

            _ => DownloadError.Unknown,
        };
    }

    public static UploadError GetUploadErrorFromException(Exception exception)
    {
        return exception switch
        {
            ValidationException => UploadError.ValidationError,

            // Upload errors
            IntegrityException => UploadError.IntegrityError,

            HttpRequestException { HttpRequestError: HttpRequestError.InvalidResponse or HttpRequestError.ResponseEnded } => UploadError.ServerError,
            HttpRequestException { StatusCode: HttpStatusCode.RequestTimeout } => UploadError.ServerError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)StatusCodes.MinClientErrorCode and <= (HttpStatusCode)StatusCodes.MaxClientErrorCode } =>
                UploadError.HttpClientSideError,
            HttpRequestException { StatusCode: >= (HttpStatusCode)StatusCodes.MinServerErrorCode and <= (HttpStatusCode)StatusCodes.MaxServerErrorCode } =>
                UploadError.ServerError,
            HttpRequestException => UploadError.NetworkError,

            ProtonApiException { Code: var code } when ValidationResponseCode.IsValidationCode(code) => UploadError.ValidationError,
            ProtonApiException { TransportCode: (int)HttpStatusCode.TooManyRequests } => UploadError.RateLimited,
            ProtonApiException { TransportCode: >= StatusCodes.MinClientErrorCode and <= StatusCodes.MaxClientErrorCode } => UploadError.HttpClientSideError,
            ProtonApiException { TransportCode: >= StatusCodes.MinServerErrorCode and <= StatusCodes.MaxServerErrorCode } => UploadError.ServerError,

            // TODO: How to better distinguish network errors, that were subject to retry in the HTTP request handler, but resulted in TimeoutException?
            TimeoutException => UploadError.ServerError,

            // Windows client specific HTTP request handler errors
            // TODO: The injected HTTP client should provide error categorization, at least for its own specific errors
            Polly.CircuitBreaker.BrokenCircuitException => UploadError.NetworkError,

            _ => UploadError.Unknown,
        };
    }
}
