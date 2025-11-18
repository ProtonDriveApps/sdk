using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class ThumbnailBlockListResponse : ApiResponse
{
    [JsonPropertyName("Thumbnails")]
    public required IReadOnlyList<ThumbnailBlock> Blocks { get; init; }
}
