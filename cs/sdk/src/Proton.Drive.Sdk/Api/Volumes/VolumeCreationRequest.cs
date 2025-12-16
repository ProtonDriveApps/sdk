using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeCreationRequest
{
    [JsonPropertyName("AddressID")]
    public required AddressId AddressId { get; init; }

    [JsonPropertyName("AddressKeyID")]
    public required AddressKeyId AddressKeyId { get; init; }

    public required PgpArmoredPrivateKey ShareKey { get; init; }

    public required PgpArmoredMessage SharePassphrase { get; init; }

    public required PgpArmoredSignature SharePassphraseSignature { get; init; }

    public required PgpArmoredMessage FolderName { get; init; }

    public required PgpArmoredPrivateKey FolderKey { get; init; }

    public required PgpArmoredMessage FolderPassphrase { get; init; }

    public required PgpArmoredSignature FolderPassphraseSignature { get; init; }

    public required PgpArmoredMessage FolderHashKey { get; init; }
}
