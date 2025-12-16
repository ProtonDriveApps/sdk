using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Serialization;

namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class PhotoDto
{
    [JsonPropertyName("LinkID")]
    public required LinkId Id { get; init; }

    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CaptureTime { get; init; }

    [JsonPropertyName("Hash")]
    public required string NameHash { get; init; }

    public required string ContentHash { get; init; }

    [JsonPropertyName("MainPhotoLinkID")]
    public string? MainPhotoLinkId { get; init; }

    [JsonPropertyName("RelatedPhotosLinkIDs")]
    public IReadOnlyList<string> RelatedPhotosLinkIds { get; init; } = [];

    public IReadOnlyList<PhotoTag> Tags { get; init; } = [];

    public IReadOnlyList<AlbumDto> Albums { get; init; } = [];
}
