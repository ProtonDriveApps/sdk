using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class DegradedFileSecrets : DegradedNodeSecrets
{
    public required PgpSessionKey? ContentKey { get; init; }
}
