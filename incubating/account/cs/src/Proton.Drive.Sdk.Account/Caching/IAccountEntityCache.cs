using Proton.Drive.Sdk.Account.Addresses;

namespace Proton.Drive.Sdk.Account.Caching;

internal interface IAccountEntityCache
{
    ValueTask SetAddressAsync(Address address, CancellationToken cancellationToken);
    ValueTask<Address?> TryGetAddressAsync(AddressId addressId, CancellationToken cancellationToken);

    ValueTask SetCurrentUserAddressesAsync(IEnumerable<Address> addresses, CancellationToken cancellationToken);
    ValueTask<IReadOnlyList<Address>?> TryGetCurrentUserAddressesAsync(CancellationToken cancellationToken);
}
