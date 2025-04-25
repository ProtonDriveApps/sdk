using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class Block
{
    public required int Index { get; init; }

    [JsonPropertyName("URL")]
    public required string Url { get; init; }

    [JsonPropertyName("EncSignature")]
    public PgpArmoredMessage? EncryptedSignature { get; init; }

    [JsonPropertyName("SignatureEmail")]
    public string? SignatureEmailAddress { get; init; }
}
