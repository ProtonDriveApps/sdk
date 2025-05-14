using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class MoveMultipleLinksRequest
{
    [JsonPropertyName("ParentLinkID")]
    public required LinkId ParentLinkId { get; init; }

    [JsonPropertyName("Links")]
    public required IReadOnlyList<MoveMultipleLinksItem> Batch { get; init; }

    [JsonPropertyName("NameSignatureEmail")]
    public required string NameSignatureEmailAddress { get; init; }

    [JsonPropertyName("SignatureEmail")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public required string? SignatureEmailAddress { get; init; }
}
