using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ThumbnailDto
{
    [JsonPropertyName("ThumbnailID")]
    public required string Id { get; init; }

    public required ThumbnailType Type { get; init; }

    [JsonPropertyName("Hash")]
    public required ReadOnlyMemory<byte> HashDigest { get; init; }

    [JsonPropertyName("Size")]
    public required int SizeOnCloudStorage { get; init; }
}
