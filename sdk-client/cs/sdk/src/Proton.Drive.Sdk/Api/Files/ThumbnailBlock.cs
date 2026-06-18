using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ThumbnailBlock
{
    [JsonPropertyName("ThumbnailID")]
    public required string ThumbnailId { get; init; }

    [JsonPropertyName("BareURL")]
    public required string BareUrl { get; init; }

    public required string Token { get; init; }
}
