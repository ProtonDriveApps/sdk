using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Events;

internal sealed class LatestEventResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required AccountEventId EventId { get; init; }
}
