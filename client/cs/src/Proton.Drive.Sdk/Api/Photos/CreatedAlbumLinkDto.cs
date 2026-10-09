using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class CreatedAlbumLinkDto
{
    [JsonPropertyName("LinkID")]
    public required LinkId LinkId { get; init; }
}
