namespace Proton.Sdk.Caching;

internal sealed class SessionSecretCache(ICacheRepository repository)
{
    private readonly ICacheRepository _repository = repository;

    public async ValueTask SetAccountKeyPassphraseAsync(string keyId, ReadOnlyMemory<byte> passphrase, CancellationToken cancellationToken)
    {
        var cacheKey = GetAccountPassphraseCacheKey(keyId);

        var serializedValue = Convert.ToBase64String(passphrase.Span);

        await _repository.SetAsync(cacheKey, serializedValue, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<ReadOnlyMemory<byte>?> TryGetAccountKeyPassphraseAsync(string keyId, CancellationToken cancellationToken)
    {
        var cacheKey = GetAccountPassphraseCacheKey(keyId);

        var serializedValue = await _repository.TryGetAsync(cacheKey, cancellationToken).ConfigureAwait(false);

        return serializedValue is not null ? Convert.FromBase64String(serializedValue) : null;
    }

    private static string GetAccountPassphraseCacheKey(string keyId)
    {
        return $"account:passphrase:{keyId}";
    }
}
