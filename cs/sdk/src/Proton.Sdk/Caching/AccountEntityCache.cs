using System.Text.Json;
using Proton.Sdk.Addresses;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Caching;

internal sealed class AccountEntityCache(ICacheRepository repository)
{
    private static readonly string[] CurrentUserAddressTags = ["current-user-address"];

    private readonly ICacheRepository _repository = repository;

    public async ValueTask SetAddressAsync(Address address, CancellationToken cancellationToken)
    {
        var value = JsonSerializer.Serialize(address, ProtonEntitySerializerContext.Default.Address);

        await _repository.SetAsync(GetAddressCacheKey(address.Id), value, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<Address?> TryGetAddressAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var value = await _repository.TryGetAsync(addressId.Value, cancellationToken).ConfigureAwait(false);

        return value is not null ? JsonSerializer.Deserialize(value, ProtonEntitySerializerContext.Default.Address) : null;
    }

    public async ValueTask SetCurrentUserAddressesAsync(IEnumerable<Address> addresses, CancellationToken cancellationToken)
    {
        foreach (var address in addresses)
        {
            var value = JsonSerializer.Serialize(address, ProtonEntitySerializerContext.Default.Address);

            await _repository.SetAsync(GetAddressCacheKey(address.Id), value, CurrentUserAddressTags, cancellationToken).ConfigureAwait(false);
        }

        await _repository.MarkTagAsCompleteAsync(CurrentUserAddressTags[0], cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyList<Address>?> TryGetCurrentUserAddressesAsync(CancellationToken cancellationToken)
    {
        if (!await _repository.GetTagIsCompleteAsync(CurrentUserAddressTags[0], cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var values = _repository.GetByTagsAsync(CurrentUserAddressTags, cancellationToken);

        var addresses = new List<Address>();

        await foreach (var value in values.ConfigureAwait(false))
        {
            try
            {
                var address = JsonSerializer.Deserialize(value, ProtonEntitySerializerContext.Default.Address);
                if (address is null)
                {
                    return null;
                }

                addresses.Add(address);
            }
            catch
            {
                // There is something wrong with the cache, pretend that it did not have the information, to incite the caller to refresh it
                return null;
            }
        }

        return addresses;
    }

    private static string GetAddressCacheKey(AddressId addressId)
    {
        return $"address:{addressId}";
    }
}
