using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class FileSecrets : NodeSecrets
{
    public required PgpSessionKey ContentKey { get; init; }
}
