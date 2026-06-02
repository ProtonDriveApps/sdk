using Proton.Drive.Sdk.Api.Events;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Events;

namespace Proton.Drive.Sdk.Api.Volumes;

internal interface IVolumesApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<VolumeResponse> GetVolumeAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask<LatestVolumeEventResponse> GetLatestEventAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask<VolumeEventListResponse> GetEventsAsync(VolumeId volumeId, DriveEventId cursorEventId, CancellationToken cancellationToken);
}
