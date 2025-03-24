using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId Id { get; init; }

    [JsonPropertyName("CreatorEmail")]
    public required string CreatorEmailAddress { get; init; }

    public required PgpArmoredPrivateKey Key { get; init; }

    public required PgpArmoredMessage Passphrase { get; init; }

    public required PgpArmoredSignature PassphraseSignature { get; init; }

    [JsonPropertyName("AddressID")]
    public required AddressId AddressId { get; init; }
}
