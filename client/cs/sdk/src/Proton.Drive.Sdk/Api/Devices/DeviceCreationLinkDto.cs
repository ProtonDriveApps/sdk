using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceCreationLinkDto
{
    public required PgpArmoredMessage Name { get; init; }

    public required PgpArmoredSecretKey NodeKey { get; init; }

    public required PgpArmoredMessage NodePassphrase { get; init; }

    public required PgpArmoredSignature NodePassphraseSignature { get; init; }

    public required PgpArmoredMessage NodeHashKey { get; init; }
}
