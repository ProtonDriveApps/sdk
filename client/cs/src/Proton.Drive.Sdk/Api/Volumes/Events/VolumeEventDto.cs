using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Events;

namespace Proton.Drive.Sdk.Api.Volumes.Events;

internal sealed class VolumeEventDto
{
    [JsonPropertyName("EventID")]
    public required DriveEventId Id { get; init; }

    [JsonPropertyName("EventType")]
    public required VolumeEventType Type { get; init; }

    public required VolumeEventLinkDto Link { get; init; }
}
