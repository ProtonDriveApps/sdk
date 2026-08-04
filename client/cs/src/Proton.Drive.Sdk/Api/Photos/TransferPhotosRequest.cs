using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class TransferPhotosRequest
{
    [JsonPropertyName("ParentLinkID")]
    public required LinkId ParentLinkId { get; init; }

    [JsonPropertyName("Links")]
    public required IReadOnlyList<TransferPhotoLinkItem> Links { get; init; }

    [JsonPropertyName("NameSignatureEmail")]
    public required string NameSignatureEmailAddress { get; init; }

    // Sent explicitly as null: the API requires it only when moving an anonymous node.
    [JsonPropertyName("SignatureEmail")]
    public string? SignatureEmailAddress { get; init; }
}
