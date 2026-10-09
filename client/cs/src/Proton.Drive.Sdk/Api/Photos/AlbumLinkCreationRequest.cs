using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class AlbumLinkCreationRequest
{
    public required PgpArmoredMessage Name { get; init; }

    [JsonPropertyName("Hash")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public required ReadOnlyMemory<byte> NameHashDigest { get; init; }

    [JsonPropertyName("NodeKey")]
    public required PgpArmoredSecretKey Key { get; init; }

    [JsonPropertyName("NodePassphrase")]
    public required PgpArmoredMessage Passphrase { get; init; }

    [JsonPropertyName("NodePassphraseSignature")]
    public required PgpArmoredSignature PassphraseSignature { get; init; }

    [JsonPropertyName("SignatureEmail")]
    public required string SignatureEmailAddress { get; init; }

    [JsonPropertyName("NodeHashKey")]
    public required PgpArmoredMessage HashKey { get; init; }

    [JsonPropertyName("XAttr")]
    public PgpArmoredMessage? ExtendedAttributes { get; init; }
}
