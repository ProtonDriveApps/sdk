using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

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

    public async ValueTask<VolumeTrashResponse> GetTrashAsync(VolumeId volumeId, int pageSize, int page, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeTrashResponse)
            .GetAsync($"volumes/{volumeId}/trash?pageSize={pageSize}&page={page}", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ApiResponse> EmptyTrashAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.ApiResponse)
            .DeleteAsync("volumes/trash", cancellationToken).ConfigureAwait(false);
    }
}
