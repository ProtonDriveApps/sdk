using Proton.Drive.Sdk.Account.Serialization;
using Proton.Drive.Sdk.Events;
using Proton.Sdk.Api.Http;

namespace Proton.Drive.Sdk.Account.Api.Events;

// FIXME: make sure that we don't listen to core events twice when Drive will need them to listen to "shared with me" events
internal readonly struct EventsApiClient(HttpClient httpClient)
{
    private readonly HttpClient _httpClient = httpClient;

    public async Task<LatestEventResponse> GetLatestEventAsync(CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.LatestEventResponse)
            .GetAsync("core/v6/events/latest", cancellationToken).ConfigureAwait(false);
    }

    public async Task<EventListResponse> GetEventsAsync(DriveEventId cursorEventId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.EventListResponse)
            .GetAsync($"core/v6/events/{cursorEventId}", cancellationToken).ConfigureAwait(false);
    }
}
