using System.Text.Json.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Events;

namespace Proton.Drive.Sdk.Api.Events;

internal sealed class LatestVolumeEventResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required DriveEventId EventId { get; init; }
}
