using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CopyPhotoContent
{
    [JsonPropertyName("ContentHash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> ContentHash { get; init; }

    [JsonPropertyName("RelatedPhotos")]
    public required IReadOnlyList<CopyPhotoRelatedItem> RelatedPhotos { get; init; }
}
