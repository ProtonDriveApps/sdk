namespace Proton.Drive.Sdk.Api.Volumes;

internal interface IVolumesApiClient
{
    ValueTask<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationParameters parameters, CancellationToken cancellationToken);
}
