using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class SharedAlbumsResponse : ApiResponse
{
    public required IReadOnlyList<SharedAlbumDto> Albums { get; init; }

    [JsonPropertyName("AnchorID")]
    public LinkId? AnchorId { get; init; }

    public bool More { get; init; }
}
