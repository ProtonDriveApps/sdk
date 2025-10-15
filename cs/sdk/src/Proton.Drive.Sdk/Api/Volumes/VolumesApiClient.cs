using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Http;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumesApiClient(HttpClient httpClient) : IVolumesApiClient
{
    private readonly HttpClient _httpClient = httpClient;

    public async ValueTask<VolumeCreationResponse> CreateVolumeAsync(VolumeCreationRequest request, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeCreationResponse)
            .PostAsync("volumes", request, DriveApiSerializerContext.Default.VolumeCreationRequest, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<VolumeResponse> GetVolumeAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeResponse)
            .GetAsync($"volumes/{volumeId}", cancellationToken).ConfigureAwait(false);
    }
}
