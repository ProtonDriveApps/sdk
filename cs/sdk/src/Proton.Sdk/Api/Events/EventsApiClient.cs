using Proton.Sdk.Events;
using Proton.Sdk.Http;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Api.Events;

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

    public async Task<EventListResponse> GetEventsAsync(EventId baselineEventId, CancellationToken cancellationToken)
    {
        return await _httpClient
            .Expecting(ProtonApiSerializerContext.Default.EventListResponse)
            .GetAsync($"core/v6/events/{baselineEventId}", cancellationToken).ConfigureAwait(false);
    }
}
