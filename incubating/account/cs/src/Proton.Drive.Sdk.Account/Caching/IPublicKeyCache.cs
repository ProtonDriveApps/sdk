using System.Diagnostics.CodeAnalysis;
using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Account.Caching;

internal interface IPublicKeyCache
{
    void SetPublicKeys(string emailAddress, IReadOnlyList<PgpPublicKey> publicKeys);
    bool TryGetPublicKeys(string emailAddress, [MaybeNullWhen(false)] out IReadOnlyList<PgpPublicKey> publicKeys);
}
