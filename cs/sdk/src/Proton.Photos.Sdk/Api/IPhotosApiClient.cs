using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Volumes;
using Proton.Photos.Sdk.Api.Photos;

namespace Proton.Photos.Sdk.Api;

internal interface IPhotosApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(PhotosVolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<ShareResponseV2> GetRootShareAsync(CancellationToken cancellationToken);

    ValueTask<TimelinePhotoListResponse> GetTimelinePhotosAsync(TimelinePhotoListRequest request, CancellationToken cancellationToken);

    ValueTask<PhotoDetailsResponse> GetDetailsAsync(VolumeId volumeId, IEnumerable<LinkId> linkIds, CancellationToken cancellationToken);
}
