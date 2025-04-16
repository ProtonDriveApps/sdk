using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes;

internal class DegradedNodeSecrets
{
    public required PgpPrivateKey? Key { get; init; }
    public required PgpSessionKey? PassphraseSessionKey { get; init; }
    public required PgpSessionKey? NameSessionKey { get; init; }
}
