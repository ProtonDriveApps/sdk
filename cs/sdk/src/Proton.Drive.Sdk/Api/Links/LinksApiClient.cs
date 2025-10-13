using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinksApiClient(HttpClient httpClient) : ILinksApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<LinkDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.LinkDetailsResponse)
            .PostAsync($"v2/volumes/{volumeId}/links", new LinkDetailsRequest(linkIds), DriveApiSerializerContext.Default.LinkDetailsRequest, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ContextShareResponse> GetContextShareAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ContextShareResponse)
            .GetAsync($"volumes/{volumeId}/links/{linkId}/context", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> MoveAsync(VolumeId volumeId, LinkId linkId, MoveSingleLinkRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .PutAsync($"v2/volumes/{volumeId}/links/{linkId}/move", request, DriveApiSerializerContext.Default.MoveSingleLinkRequest, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> MoveMultipleAsync(VolumeId volumeId, MoveMultipleLinksRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .PutAsync($"volumes/{volumeId}/links/move-multiple", request, DriveApiSerializerContext.Default.MoveMultipleLinksRequest, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> RenameAsync(VolumeId volumeId, LinkId linkId, RenameLinkRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .PutAsync($"v2/volumes/{volumeId}/links/{linkId}/rename", request, DriveApiSerializerContext.Default.RenameLinkRequest, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<AggregateApiResponse<LinkIdResponsePair>> DeleteMultipleAsync(
        VolumeId volumeId,
        MultipleLinksNullaryRequest request,
        CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.AggregateApiResponseLinkIdResponsePair)
            .PostAsync(
                $"v2/volumes/{volumeId}/delete_multiple",
                request,
                DriveApiSerializerContext.Default.MultipleLinksNullaryRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }
}
