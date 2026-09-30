using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class ReportRecentlyAccessedItemDto
{
    [JsonPropertyName("VolumeID")]
    public required VolumeId VolumeId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }

    public required long AccessTime { get; init; }
}
