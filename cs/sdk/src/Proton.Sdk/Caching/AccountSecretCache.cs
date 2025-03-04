using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Caching;

internal sealed class AccountSecretCache(ICacheRepository repository)
{
    private const string UserKeysCacheKey = "account:user-keys";

    private readonly ICacheRepository _repository = repository;

    public async ValueTask SetUserKeysAsync(IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(unlockedKeys, ProtonEntitySerializerContext.Default.IEnumerablePgpPrivateKey);

        await _repository.SetAsync(UserKeysCacheKey, serializedValue, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetUserKeysAsync(CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(UserKeysCacheKey, cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize<PgpPrivateKey[]>(serializedValue, ProtonEntitySerializerContext.Default.PgpPrivateKeyArray)
            : null;
    }

    public async ValueTask SetAddressKeysAsync(AddressId addressId, IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(unlockedKeys, ProtonEntitySerializerContext.Default.IEnumerablePgpPrivateKey);

        await _repository.SetAsync(GetAddressKeysCacheKey(addressId), serializedValue, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(GetAddressKeysCacheKey(addressId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize<PgpPrivateKey[]>(serializedValue, ProtonEntitySerializerContext.Default.PgpPrivateKeyArray)
            : null;
    }

    private static string GetAddressKeysCacheKey(AddressId addressId)
    {
        return $"account:address:{addressId}:keys";
    }
}
