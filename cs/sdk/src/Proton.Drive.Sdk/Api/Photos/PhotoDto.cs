using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotoDto : FileDto
{
    [JsonPropertyName("LinkID")]
    public LinkId? Id { get; init; }

    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CaptureTime { get; init; }

    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public ReadOnlyMemory<byte>? ContentHash { get; init; }

    [JsonPropertyName("Hash")]
    public string? NameHash { get; init; }

    [JsonPropertyName("MainPhotoLinkID")]
    public string? MainPhotoLinkId { get; init; }

    [JsonPropertyName("RelatedPhotosLinkIDs")]
    public required IReadOnlyList<string> RelatedPhotosLinkIds { get; init; } = [];

    public required IReadOnlyList<PhotoTag> Tags { get; init; } = [];

    [JsonPropertyName("Albums")]
    public required IReadOnlyList<PhotoAlbumInclusionDto> AlbumInclusions { get; init; } = [];
}
