using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Sdk.Events.Api;

internal sealed class LatestEventResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required EventId EventId { get; init; }
}
