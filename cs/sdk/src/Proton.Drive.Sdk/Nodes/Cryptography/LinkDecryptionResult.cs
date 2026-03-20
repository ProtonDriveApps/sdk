using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal sealed class LinkDecryptionResult
{
    public required Result<PhasedDecryptionOutput<ReadOnlyMemory<byte>>, ProtonDriveError> Passphrase { get; init; }
    public required AuthorshipClaim NodeAuthorshipClaim { get; init; }
    public required Result<PhasedDecryptionOutput<string>, ProtonDriveError> Name { get; init; }
    public required AuthorshipClaim NameAuthorshipClaim { get; init; }
    public required Result<PgpPrivateKey, ProtonDriveError> NodeKey { get; init; }
}
