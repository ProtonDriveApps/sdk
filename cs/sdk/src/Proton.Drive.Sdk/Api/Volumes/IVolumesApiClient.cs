using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Volumes;

internal interface IVolumesApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationRequest request, CancellationToken cancellationToken);

    ValueTask<VolumeResponse> GetVolumeAsync(VolumeId volumeId, CancellationToken cancellationToken);

    ValueTask<VolumeTrashResponse> GetTrashAsync(VolumeId volumeId, int pageSize, int page, CancellationToken cancellationToken);

    ValueTask<ApiResponse> EmptyTrashAsync(VolumeId volumeId, CancellationToken cancellationToken);
}
