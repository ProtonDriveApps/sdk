using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class UpdateAlbumRequest
{
    [JsonPropertyName("CoverLinkID")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public LinkId? CoverLinkId { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AlbumLinkUpdate? Link { get; init; }
}
