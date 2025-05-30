using System.Net.Http.Headers;
using System.Net.Mime;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Storage;

internal sealed class StorageApiClient(HttpClient httpClient) : IStorageApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<ApiResponse> UploadBlobAsync(
        string baseUrl,
        string token,
        Stream stream,
        Action<long>? onProgress,
        CancellationToken cancellationToken)
    {
        using var blobContent = new StreamContent(stream);
        blobContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data") { Name = "Block", FileName = "blob" };
        blobContent.Headers.ContentType = new MediaTypeHeaderValue(MediaTypeNames.Application.Octet);

        using var multipartContent = new MultipartFormDataContent("-----------------------------" + Guid.NewGuid().ToString("N"));
        multipartContent.Add(blobContent);

        using var requestMessage = HttpRequestMessageFactory.Create(HttpMethod.Post, baseUrl, multipartContent);
        requestMessage.Headers.Add("pm-storage-token", token);

        // TODO: investigate what happens with the stream in case of a retry after a failure, is there a seek back to its beginning?
        var response = await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);

        onProgress?.Invoke(stream.Position);

        return response;
    }

    public async ValueTask<Stream> GetBlobStreamAsync(string url, CancellationToken cancellationToken)
    {
        var blobResponse = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);

        await blobResponse.EnsureApiSuccessAsync(ProtonApiSerializerContext.Default.ApiResponse, cancellationToken).ConfigureAwait(false);

        return await blobResponse.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
    }
}
