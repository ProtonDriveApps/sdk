using System.Text.Json.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Events;

namespace Proton.Drive.Sdk.Account.Api.Events;

internal sealed class LatestEventResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required DriveEventId EventId { get; init; }
}
