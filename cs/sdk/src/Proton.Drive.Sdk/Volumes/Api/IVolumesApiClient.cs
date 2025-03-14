namespace Proton.Drive.Sdk.Volumes.Api;

internal interface IVolumesApiClient
{
    Task<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationParameters parameters, CancellationToken cancellationToken);
}
