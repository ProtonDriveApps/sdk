using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class BlockDto
{
    public required int Index { get; init; }

    [JsonPropertyName("BareURL")]
    public required string BareUrl { get; init; }

    public required string Token { get; init; }
}
