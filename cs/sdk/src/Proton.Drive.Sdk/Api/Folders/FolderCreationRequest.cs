using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Folders;

internal sealed class FolderCreationRequest : NodeCreationRequest
{
    [JsonPropertyName("NodeHashKey")]
    public required PgpArmoredMessage HashKey { get; init; }

    [JsonPropertyName("SignatureEmail")]
    public required string SignatureEmailAddress { get; init; }

    [JsonPropertyName("XAttr")]
    public PgpArmoredMessage? ExtendedAttributes { get; init; }
}
