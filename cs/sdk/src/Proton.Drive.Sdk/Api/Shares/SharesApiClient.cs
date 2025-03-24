using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class SharesApiClient(HttpClient httpClient) : ISharesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<ShareResponseV2> GetMyFilesShareAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ShareResponseV2)
            .GetAsync("v2/shares/my-files", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ShareResponse> GetShareAsync(ShareId id, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ShareResponse)
            .GetAsync($"shares/{id}", cancellationToken).ConfigureAwait(false);
    }
}
