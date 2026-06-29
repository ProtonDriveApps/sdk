using Proton.Drive.Sdk.Api.Volumes.Events;
using Proton.Drive.Sdk.Events;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Volumes;

internal interface IVolumesApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<VolumeResponse> GetVolumeAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask<VolumeLatestEventResponse> GetLatestEventAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask<VolumeEventListResponse> GetEventsAsync(VolumeId volumeId, DriveEventId cursorEventId, CancellationToken cancellationToken);
}
