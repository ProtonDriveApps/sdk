using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotosApiClient(HttpClient httpClient) : IPhotosApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<VolumeCreationResponse> CreateVolumeAsync(PhotosVolumeCreationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeCreationResponse)
            .PostAsync("photos/volumes", request, PhotosApiSerializerContext.Default.PhotosVolumeCreationRequest, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ShareResponseV2> GetRootShareAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.ShareResponseV2)
            .GetAsync("v2/shares/photos", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<TimelinePhotoListResponse> GetTimelinePhotosAsync(TimelinePhotoListRequest request, CancellationToken cancellationToken)
    {
        var query = request.PreviousPageLastLinkId is not null ? $"?PreviousPageLastLinkID={request.PreviousPageLastLinkId}" : string.Empty;

        return await _httpClient
            .Expecting(PhotosApiSerializerContext.Default.TimelinePhotoListResponse)
            .GetAsync($"volumes/{request.VolumeId}/photos{query}", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<PhotoDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(PhotosApiSerializerContext.Default.PhotoDetailsResponse)
            .PostAsync(
                $"photos/volumes/{volumeId}/links",
                new LinkDetailsRequest(linkIds),
                DriveApiSerializerContext.Default.LinkDetailsRequest,
                cancellationToken)
            .ConfigureAwait(false);
    }
}
