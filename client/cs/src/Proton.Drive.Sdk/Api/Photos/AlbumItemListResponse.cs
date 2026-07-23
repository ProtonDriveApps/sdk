using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class AlbumItemListResponse
{
    public required IReadOnlyList<AlbumItemDto> Photos { get; init; }

    public bool More { get; init; }

    [JsonPropertyName("AnchorID")]
    public LinkId? AnchorId { get; init; }
}
