using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;

namespace Proton.Drive.Sdk.Account.Caching;

internal interface IAccountSecretCache
{
    ValueTask SetUserKeysAsync(IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetUserKeysAsync(CancellationToken cancellationToken);

    ValueTask SetAddressKeysAsync(AddressId addressId, IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken);
}
