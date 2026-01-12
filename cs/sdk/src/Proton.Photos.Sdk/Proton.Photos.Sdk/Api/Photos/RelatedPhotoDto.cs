using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Serialization;

namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class RelatedPhotoDto
{
    [JsonPropertyName("LinkID")]
    public required LinkId Id { get; init; }

    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CaptureTime { get; init; }

    [JsonPropertyName("Hash")]
    public required string NameHash { get; init; }

    public string? ContentHash { get; init; }
}
