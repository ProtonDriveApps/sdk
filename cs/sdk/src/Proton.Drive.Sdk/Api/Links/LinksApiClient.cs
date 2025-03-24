using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinksApiClient(HttpClient httpClient) : ILinksApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<LinkDetailsResponse> GetLinkDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.LinkDetailsResponse)
            .PostAsync($"v2/volumes/{volumeId}/links", new LinkDetailsRequest(linkIds), DriveApiSerializerContext.Default.LinkDetailsRequest, cancellationToken)
            .ConfigureAwait(false);
    }
}
