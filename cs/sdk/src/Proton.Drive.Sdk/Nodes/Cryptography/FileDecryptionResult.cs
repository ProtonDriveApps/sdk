using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal sealed class FileDecryptionResult
{
    public required LinkDecryptionResult Link { get; init; }
    public required ValResult<DecryptionOutput<PgpSessionKey>, string?> ContentKey { get; init; }
    public required ValResult<DecryptionOutput<ExtendedAttributes?>, string?> ExtendedAttributes { get; init; }
    public required AuthorshipClaim ContentAuthorshipClaim { get; init; }
}
