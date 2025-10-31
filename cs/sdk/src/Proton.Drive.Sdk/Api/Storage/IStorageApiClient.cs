using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Storage;

internal interface IStorageApiClient
{
    ValueTask<ApiResponse> UploadBlobAsync(string baseUrl, string token, Stream stream, Action<long>? onProgress, CancellationToken cancellationToken);
    ValueTask<Stream> GetBlobStreamAsync(string baseUrl, string token, CancellationToken cancellationToken);
}
