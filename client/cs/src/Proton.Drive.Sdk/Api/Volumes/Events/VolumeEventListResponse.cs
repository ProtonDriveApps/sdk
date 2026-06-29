using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Events;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Volumes.Events;

internal sealed class VolumeEventListResponse : ApiResponse
{
    [JsonPropertyName("EventID")]
    public required DriveEventId LastEventId { get; init; }

    public required IReadOnlyList<VolumeEventDto> Events { get; init; }

    [JsonPropertyName("More")]
    public required bool MoreEntriesExist { get; init; }

    [JsonPropertyName("Refresh")]
    public required bool RefreshRequired { get; init; }
}
