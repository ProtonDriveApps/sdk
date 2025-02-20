using Proton.Sdk.Addresses;

namespace Proton.Sdk.Caching;

internal sealed class AccountEntityCache(ICache<string, string> underlyingCache)
{
    public ValueTask SetAddressAsync(Address address, CancellationToken cancellationToken)
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask<Address?> TryGetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        return ValueTask.FromResult(default(Address));
    }
}
