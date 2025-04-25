using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class Thumbnail
{
    [JsonPropertyName("ThumbnailID")]
    public required string Id { get; init; }

    public required int Type { get; init; }

    [JsonPropertyName("BaseURL")]
    public required ReadOnlyMemory<byte> HashDigest { get; init; }

    public required int Size { get; init; }
}
