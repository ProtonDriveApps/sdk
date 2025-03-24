using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Api.Keys;

internal sealed class PublicKeyEntry
{
    [JsonPropertyName("Flags")]
    public required PublicKeyStatus Status { get; init; }

    public required PgpArmoredPublicKey PublicKey { get; init; }
}
