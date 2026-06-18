using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ThumbnailCreationRequest
{
    public required int Size { get; init; }

    public required ThumbnailType Type { get; init; }

    [JsonPropertyName("Hash")]
    public required ReadOnlyMemory<byte> HashDigest { get; init; }
}
