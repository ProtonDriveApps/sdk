using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class AlbumListItemDto
{
    [JsonPropertyName("LinkID")]
    public required LinkId Id { get; init; }
}
