using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal readonly struct MultipleLinksNullaryRequest
{
    [JsonPropertyName("LinkIDs")]
    public IEnumerable<LinkId> LinkIds { get; init; }
}
