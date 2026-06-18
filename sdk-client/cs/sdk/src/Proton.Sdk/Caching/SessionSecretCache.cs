namespace Proton.Sdk.Caching;

internal sealed class SessionSecretCache(ICacheRepository repository) : ISessionSecretCache
{
    private readonly ICacheRepository _repository = repository;

    public ValueTask SetAccountKeyPassphraseAsync(string keyId, ReadOnlyMemory<byte> passphrase, CancellationToken cancellationToken)
    {
        var cacheKey = GetAccountPassphraseCacheKey(keyId);

        var serializedValue = Convert.ToBase64String(passphrase.Span);

        return _repository.SetAsync(cacheKey, serializedValue, cancellationToken);
    }

    public async ValueTask<ReadOnlyMemory<byte>?> TryGetAccountKeyPassphraseAsync(string keyId, CancellationToken cancellationToken)
    {
        var cacheKey = GetAccountPassphraseCacheKey(keyId);

        var serializedValue = await _repository.TryGetAsync(cacheKey, cancellationToken).ConfigureAwait(false);

        return serializedValue is not null ? (ReadOnlyMemory<byte>?)Convert.FromBase64String(serializedValue) : null;
    }

    private static string GetAccountPassphraseCacheKey(string keyId)
    {
        return $"account:passphrase:{keyId}";
    }
}
