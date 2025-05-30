using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Api.Volumes;

internal readonly record struct ShareTrashDto(
    [property: JsonPropertyName("ShareID")]
    ShareId ShareId,
    [property: JsonPropertyName("LinkIDs")]
    IReadOnlyList<LinkId> LinkIds,
    [property: JsonPropertyName("ParentIDs")]
    IReadOnlyList<LinkId> ParentIds);
