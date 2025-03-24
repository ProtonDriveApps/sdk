using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal readonly struct LinkDetailsRequest(IEnumerable<LinkId> linkIds)
{
    [JsonPropertyName("LinkIDs")]
    public IEnumerable<LinkId> LinkIds { get; } = linkIds;
}
