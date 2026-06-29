using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Volumes.Events;

internal sealed class VolumeEventLinkDto
{
    [JsonPropertyName("LinkID")]
    public required LinkId Id { get; init; }

    [JsonPropertyName("ParentLinkID")]
    public required LinkId? ParentId { get; init; }

    public required bool IsShared { get; init; }

    public required bool IsTrashed { get; init; }
}
