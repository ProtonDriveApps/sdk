using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class PhotosAttributesDto
{
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CaptureTime { get; init; }

    [JsonPropertyName("ContentHash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> ContentHashDigest { get; init; }

    [JsonPropertyName("MainPhotoLinkID")]
    public LinkId? MainPhotoLinkId { get; init; }

    public IReadOnlySet<PhotoTag>? Tags { get; init; }
}
