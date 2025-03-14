using System.Text.Json.Serialization;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Volumes.Api;

internal sealed class VolumeCreationParameters
{
    [JsonPropertyName("AddressID")]
    public required string AddressId { get; init; }

    public required PgpArmoredPrivateKey ShareKey { get; init; }

    [JsonPropertyName("SharePassphrase")]
    public required PgpArmoredMessage ShareKeyPassphrase { get; init; }

    [JsonPropertyName("SharePassphraseSignature")]
    public required PgpArmoredSignature ShareKeyPassphraseSignature { get; init; }

    public required PgpArmoredMessage FolderName { get; init; }

    public required PgpArmoredPrivateKey FolderKey { get; init; }

    [JsonPropertyName("FolderPassphrase")]
    public required PgpArmoredMessage FolderKeyPassphrase { get; init; }

    [JsonPropertyName("FolderPassphraseSignature")]
    public required PgpArmoredSignature FolderKeyPassphraseSignature { get; init; }

    public required PgpArmoredMessage FolderHashKey { get; init; }
}
