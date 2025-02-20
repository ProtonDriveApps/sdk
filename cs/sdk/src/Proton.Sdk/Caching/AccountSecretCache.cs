using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;

namespace Proton.Sdk.Caching;

internal sealed class AccountSecretCache(ICache<string, ReadOnlyMemory<byte>> underlyingCache)
{
    public ValueTask SetUserKeysAsync(IEnumerable<PgpPrivateKey> userKeys, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetUserKeysAsync(CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public ValueTask SetAddressKeysAsync(IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }
}
