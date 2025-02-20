using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Keys.Api;

internal sealed class PublicKeyEntry
{
    [JsonPropertyName("Flags")]
    public required PublicKeyStatus Status { get; init; }

    public required PgpArmoredPublicKey PublicKey { get; init; }
}
