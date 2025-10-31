using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockDto
{
    public required int Index { get; init; }

    [JsonPropertyName("Hash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> HashDigest { get; init; }

    [JsonPropertyName("BareURL")]
    public required string BareUrl { get; init; }

    public required string Token { get; init; }
}
