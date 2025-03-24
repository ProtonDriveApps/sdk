using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal class NodeSecrets
{
    public required PgpPrivateKey Key { get; init; }
    public required PgpSessionKey PassphraseSessionKey { get; init; }
    public required PgpSessionKey? NameSessionKey { get; init; }
}
