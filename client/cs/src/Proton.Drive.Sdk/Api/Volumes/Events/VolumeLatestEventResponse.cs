using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Events;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Volumes.Events;

internal sealed class VolumeLatestEventResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required DriveEventId EventId { get; init; }
}
