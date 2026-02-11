using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Photos;

internal sealed class PhotosVolumeLinkCreationParameters
{
    public required PgpArmoredMessage Name { get; init; }

    public required PgpArmoredPrivateKey NodeKey { get; init; }

    public required PgpArmoredMessage NodePassphrase { get; init; }

    public required PgpArmoredSignature NodePassphraseSignature { get; init; }

    public required PgpArmoredMessage NodeHashKey { get; init; }
}
