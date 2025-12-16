using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;

namespace Proton.Photos.Sdk.Api.Photos;

internal sealed class PhotosVolumeShareCreationParameters
{
    [JsonPropertyName("AddressID")]
    public required AddressId AddressId { get; init; }

    [JsonPropertyName("AddressKeyID")]
    public required AddressKeyId AddressKeyId { get; init; }

    public required PgpArmoredPrivateKey Key { get; init; }

    public required PgpArmoredMessage Passphrase { get; init; }

    public required PgpArmoredSignature PassphraseSignature { get; init; }
}
