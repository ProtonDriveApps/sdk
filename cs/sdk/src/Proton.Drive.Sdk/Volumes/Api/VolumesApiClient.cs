using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Volumes.Api;

internal sealed class VolumesApiClient(HttpClient httpClient) : IVolumesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async Task<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationParameters parameters, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeCreationResponse)
            .PostAsync("volumes", parameters, DriveApiSerializerContext.Default.VolumeCreationParameters, cancellationToken).ConfigureAwait(false);
    }
}
