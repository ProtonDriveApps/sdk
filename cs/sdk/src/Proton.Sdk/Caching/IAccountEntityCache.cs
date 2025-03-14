using Proton.Sdk.Addresses;

namespace Proton.Sdk.Caching;

internal interface IAccountEntityCache
{
    ValueTask SetAddressAsync(Address address, CancellationToken cancellationToken);
    ValueTask<Address?> TryGetAddressAsync(AddressId addressId, CancellationToken cancellationToken);

    ValueTask SetCurrentUserAddressesAsync(IEnumerable<Address> addresses, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<Address>?> TryGetCurrentUserAddressesAsync(CancellationToken cancellationToken);
}
