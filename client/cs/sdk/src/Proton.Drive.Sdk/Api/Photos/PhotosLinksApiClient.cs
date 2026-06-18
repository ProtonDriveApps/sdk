using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotosLinksApiClient(HttpClient httpClient) : ILinksApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    private readonly ILinksApiClient _driveImplementation = new LinksApiClient(httpClient);

    public async ValueTask<LinkDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.LinkDetailsResponse)
            .PostAsync(
                $"photos/volumes/{volumeId}/links",
                new LinkDetailsRequest(linkIds),
                DriveApiSerializerContext.Default.LinkDetailsRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public ValueTask<ContextShareResponse> GetContextShareAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken)
    {
        return _driveImplementation.GetContextShareAsync(volumeId, linkId, cancellationToken);
    }

    public ValueTask<ApiResponse> MoveAsync(VolumeId volumeId, LinkId linkId, MoveSingleLinkRequest request, CancellationToken cancellationToken)
    {
        return _driveImplementation.MoveAsync(volumeId, linkId, request, cancellationToken);
    }

    public ValueTask<ApiResponse> MoveMultipleAsync(VolumeId volumeId, MoveMultipleLinksRequest request, CancellationToken cancellationToken)
    {
        return _driveImplementation.MoveMultipleAsync(volumeId, request, cancellationToken);
    }

    public ValueTask<ApiResponse> RenameAsync(VolumeId volumeId, LinkId linkId, RenameLinkRequest request, CancellationToken cancellationToken)
    {
        return _driveImplementation.RenameAsync(volumeId, linkId, request, cancellationToken);
    }

    public ValueTask<AggregateApiResponse<LinkIdResponsePair>> DeleteMultipleAsync(
        VolumeId volumeId,
        IEnumerable<LinkId> linkIds,
        CancellationToken cancellationToken)
    {
        return _driveImplementation.DeleteMultipleAsync(volumeId, linkIds, cancellationToken);
    }

    public ValueTask<NodeNameAvailabilityResponse> GetAvailableNames(
        VolumeId volumeId,
        LinkId folderId,
        NodeNameAvailabilityRequest request,
        CancellationToken cancellationToken)
    {
        return _driveImplementation.GetAvailableNames(volumeId, folderId, request, cancellationToken);
    }
}
