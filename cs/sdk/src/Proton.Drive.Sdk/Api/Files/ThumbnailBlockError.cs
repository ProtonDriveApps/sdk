using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ThumbnailBlockError
{
    [JsonPropertyName("ThumbnailID")]
    public required string ThumbnailId { get; init; }

    [JsonPropertyName("Error")]
    public required string Error { get; init; }

    [JsonPropertyName("Code")]
    public required int Code { get; init; }
}
