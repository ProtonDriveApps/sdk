using System.Text.Json.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Events;

namespace Proton.Sdk.Api.Events;

internal sealed class LatestEventResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required EventId EventId { get; init; }
}
