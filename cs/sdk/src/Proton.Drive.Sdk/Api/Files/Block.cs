using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class Block
{
    public required int Index { get; init; }

    [JsonPropertyName("URL")]
    public required string Url { get; init; }
}
