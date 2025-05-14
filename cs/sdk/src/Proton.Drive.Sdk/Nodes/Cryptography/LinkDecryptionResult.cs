using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal sealed class LinkDecryptionResult
{
    public required ValResult<PhasedDecryptionOutput<ReadOnlyMemory<byte>>, string> Passphrase { get; init; }
    public required AuthorshipClaim NodeAuthorshipClaim { get; init; }
    public required ValResult<PhasedDecryptionOutput<string>, string> Name { get; init; }
    public required AuthorshipClaim NameAuthorshipClaim { get; init; }
    public required ValResult<PgpPrivateKey, string?> NodeKey { get; init; }
}
