using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;
using Proton.Sdk.Serialization;

namespace Proton.Sdk.Caching;

internal sealed class AccountSecretCache(ICacheRepository repository) : IAccountSecretCache
{
    private const string UserKeysCacheKey = "user:current:keys";

    private readonly ICacheRepository _repository = repository;

    public ValueTask SetUserKeysAsync(IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(unlockedKeys, SecretsSerializerContext.Default.IEnumerablePgpPrivateKey);

        return _repository.SetAsync(UserKeysCacheKey, serializedValue, cancellationToken);
    }

    public async ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetUserKeysAsync(CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(UserKeysCacheKey, cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, SecretsSerializerContext.Default.PgpPrivateKeyArray)
            : null;
    }

    public ValueTask SetAddressKeysAsync(AddressId addressId, IEnumerable<PgpPrivateKey> unlockedKeys, CancellationToken cancellationToken)
    {
        var serializedValue = JsonSerializer.Serialize(unlockedKeys, SecretsSerializerContext.Default.IEnumerablePgpPrivateKey);

        return _repository.SetAsync(GetAddressKeysCacheKey(addressId), serializedValue, cancellationToken);
    }

    public async ValueTask<IReadOnlyList<PgpPrivateKey>?> TryGetAddressKeysAsync(AddressId addressId, CancellationToken cancellationToken)
    {
        var serializedValue = await _repository.TryGetAsync(GetAddressKeysCacheKey(addressId), cancellationToken).ConfigureAwait(false);

        return serializedValue is not null
            ? JsonSerializer.Deserialize(serializedValue, SecretsSerializerContext.Default.PgpPrivateKeyArray)
            : null;
    }

    private static string GetAddressKeysCacheKey(AddressId addressId)
    {
        return $"address:{addressId}:keys";
    }
}
