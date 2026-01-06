using System.Net.Http.Headers;
using System.Net.Mime;
using System.Runtime.ExceptionServices;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Storage;

internal sealed class StorageApiClient(HttpClient defaultHttpClient, HttpClient storageHttpClient) : IStorageApiClient
{
    private readonly HttpClient _defaultHttpClient = defaultHttpClient;
    private readonly HttpClient _storageHttpClient = storageHttpClient;

    public async ValueTask<ApiResponse> UploadBlobAsync(
        string baseUrl,
        string token,
        Stream stream,
        CancellationToken cancellationToken)
    {
        using var blobContent = new StreamContent(stream);
        blobContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data") { Name = "Block", FileName = "blob" };
        blobContent.Headers.ContentType = new MediaTypeHeaderValue(MediaTypeNames.Application.Octet);

        using var multipartContent = new MultipartFormDataContent("-----------------------------" + Guid.NewGuid().ToString("N"))
        {
            blobContent,
        };

        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Post, baseUrl, multipartContent);
        requestMessage.Headers.Add("pm-storage-token", token);
        requestMessage.SetRequestType(HttpRequestType.StorageUpload);

        // TODO: investigate what happens with the stream in case of a retry after a failure, is there a seek back to its beginning?
        return await _storageHttpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<Stream> GetBlobStreamAsync(string baseUrl, string token, CancellationToken cancellationToken)
    {
        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Get, baseUrl);
        requestMessage.Headers.Add("pm-storage-token", token);
        requestMessage.SetRequestType(HttpRequestType.StorageDownload);

        try
        {
            // Because of HttpCompletionOption.ResponseHeadersRead option, the long timeout is not needed, so we don't use the storage HTTP client
            var blobResponse = await _defaultHttpClient.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);

            await blobResponse.EnsureApiSuccessAsync(ProtonApiSerializerContext.Default.ApiResponse, cancellationToken).ConfigureAwait(false);

            return await blobResponse.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException e) when (e.InnerException is TimeoutException timeoutException)
        {
            ExceptionDispatchInfo.Capture(timeoutException).Throw();
            throw;  // This line is never reached
        }
    }
}
