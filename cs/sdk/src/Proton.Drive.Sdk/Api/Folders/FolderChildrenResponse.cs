using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Folders;

internal sealed class FolderChildrenResponse : ApiResponse
{
    [JsonPropertyName("LinkIDs")]
    public required IReadOnlyList<LinkId> LinkIds { get; init; }

    public LinkId? AnchorId { get; init; }

    [JsonPropertyName("More")]
    public required bool MoreResultsExist { get; init; }
}
