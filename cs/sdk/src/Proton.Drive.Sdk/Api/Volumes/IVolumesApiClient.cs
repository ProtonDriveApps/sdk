using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Volumes;

internal interface IVolumesApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<VolumeResponse> GetVolumeAsync(VolumeId volumeId, CancellationToken cancellationToken);
}
