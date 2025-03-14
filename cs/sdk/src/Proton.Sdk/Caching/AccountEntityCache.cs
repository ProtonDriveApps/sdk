using System.Text.Json;
using Proton.Sdk.Addresses;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Caching;

internal sealed class AccountEntityCache(ICacheRepository repository) : IAccountEntityCache
{
    private static readonly string[] CurrentUserAddressTags = ["user:current:address"];

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetAddressAsync(Address address, CancellationToken cancellationToken)
    {
        var value = JsonSerializer.Serialize(address, AccountEntitySerializerContext.Default.Address);

        return _repository.SetAsync(GetAddressCacheKey(address.Id), value, cancellationToken);
    }

    public async ValueTask<Address?> TryGetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(GetAddressCacheKey(addressId), cancellationToken).ConfigureAwait(false);

        return value is not null ? JsonSerializer.Deserialize(value, AccountEntitySerializerContext.Default.Address) : null;
    }

    public async ValueTask SetCurrentUserAddressesAsync(IEnumerable<Address> addresses, CancellationToken cancellationToken)
    {
        await _repository.SetCompleteCollection(
            addresses,
            address => GetAddressCacheKey(address.Id),
            CurrentUserAddressTags,
            AccountEntitySerializerContext.Default.Address,
            cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyList<Address>?> TryGetCurrentUserAddressesAsync(CancellationToken cancellationToken)
    {
        return await _repository.TryGetCompleteCollection(
            CurrentUserAddressTags,
            AccountEntitySerializerContext.Default.Address,
            cancellationToken).ConfigureAwait(false);
    }

    private static string GetAddressCacheKey(AddressId addressId)
    {
        return $"address:{addressId}";
    }
}
