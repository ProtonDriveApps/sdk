using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.Folders;

internal sealed class FoldersApiClient(HttpClient httpClient) : IFoldersApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async Task<FolderChildrenResponse> GetChildrenAsync(
        VolumeId volumeId,
        LinkId linkId,
        LinkId? anchorId,
        CancellationToken cancellationToken)
    {
        var query = anchorId is not null ? $"?AnchorID={anchorId}" : string.Empty;

        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.FolderChildrenResponse)
            .GetAsync($"v2/volumes/{volumeId}/folders/{linkId}/children{query}", cancellationToken).ConfigureAwait(false);
    }
}
