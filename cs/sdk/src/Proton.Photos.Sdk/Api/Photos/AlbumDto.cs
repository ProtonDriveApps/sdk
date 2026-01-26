using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Serialization;

namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class AlbumDto
{
    [JsonPropertyName("AlbumLinkID")]
    public required LinkId Id { get; init; }

    [JsonPropertyName("Hash")]
    public required string NameHash { get; init; }

    public required string ContentHash { get; init; }

    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    [JsonPropertyName("AddedTime")]
    public required DateTime CreationTime { get; init; }
}
