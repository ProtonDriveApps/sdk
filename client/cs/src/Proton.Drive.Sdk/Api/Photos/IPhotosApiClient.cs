using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Photos;

internal interface IPhotosApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(PhotosVolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<ShareResponseV2> GetRootShareAsync(CancellationToken cancellationToken);

    ValueTask<TimelinePhotoListResponse> GetTimelinePhotosAsync(TimelinePhotoListRequest request, CancellationToken cancellationToken);

    ValueTask<LinkDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken);

    ValueTask<FindDuplicatesResponse> FindDuplicatesAsync(
        VolumeId volumeId,
        IReadOnlyList<ReadOnlyMemory<byte>> nameHashes,
        CancellationToken cancellationToken);

    ValueTask<ApiResponse> AddPhotoTagsAsync(VolumeId volumeId, LinkId linkId, IReadOnlyList<int> tags, CancellationToken cancellationToken);

    ValueTask<ApiResponse> RemovePhotoTagsAsync(VolumeId volumeId, LinkId linkId, IReadOnlyList<int> tags, CancellationToken cancellationToken);

    ValueTask<ApiResponse> SetPhotoFavoriteAsync(VolumeId volumeId, LinkId linkId, CancellationToken cancellationToken);
}
