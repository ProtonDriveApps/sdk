using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class MoveMultipleLinksRequest
{
    [JsonPropertyName("ParentLinkID")]
    public required LinkId NewParentLinkId { get; init; }

    [JsonPropertyName("Links")]
    public required IEnumerable<MoveMultipleLinksItem> Batch { get; init; }

    [JsonPropertyName("NameSignatureEmail")]
    public required string NameSignatureEmailAddress { get; init; }

    [JsonPropertyName("SignatureEmail")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public required string? SignatureEmailAddress { get; init; }
}
