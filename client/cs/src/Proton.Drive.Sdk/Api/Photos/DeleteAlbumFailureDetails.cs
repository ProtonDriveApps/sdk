using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class DeleteAlbumFailureDetails
{
    [JsonPropertyName("ChildLinkIDs")]
    public IReadOnlyList<LinkId>? ChildLinkIDs { get; init; }
}
