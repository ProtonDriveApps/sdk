using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;

namespace Proton.Sdk.Caching;

internal interface IAccountSecretCache
{
    ValueTask SetUserKeysAsync(IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetUserKeysAsync(CancellationToken cancellationToken);

    ValueTask SetAddressKeysAsync(AddressId addressId, IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken);
}
