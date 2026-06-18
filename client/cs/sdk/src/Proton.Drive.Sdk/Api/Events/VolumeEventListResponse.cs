using System.Text.Json.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Events;

namespace Proton.Drive.Sdk.Api.Events;

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
