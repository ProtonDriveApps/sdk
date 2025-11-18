using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal struct ThumbnailBlockListRequest
{
    [JsonPropertyName("ThumbnailIDs")]
    public required IEnumerable<string> ThumbnailIds { get; init; }
}
