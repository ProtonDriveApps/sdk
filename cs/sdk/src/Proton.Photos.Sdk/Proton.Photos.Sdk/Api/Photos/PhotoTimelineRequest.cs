using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class PhotoTimelineRequest
{
    public required VolumeId VolumeId { get; init; }

    [JsonPropertyName("PreviousPageLastLinkID")]
    public LinkId? PreviousPageLastLinkId { get; init; }
}
