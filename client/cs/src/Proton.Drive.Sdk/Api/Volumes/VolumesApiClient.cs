using Proton.Drive.Sdk.Api.Volumes.Events;
using Proton.Drive.Sdk.Events;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api.Http;

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

    public async ValueTask<VolumeLatestEventResponse> GetLatestEventAsync(VolumeId volumeId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeLatestEventResponse)
            .GetAsync($"volumes/{volumeId}/events/latest", cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<VolumeEventListResponse> GetEventsAsync(VolumeId volumeId, DriveEventId cursorEventId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(DriveApiSerializerContext.Default.VolumeEventListResponse)
            .GetAsync($"v2/volumes/{volumeId}/events/{cursorEventId}", cancellationToken).ConfigureAwait(false);
    }
}
