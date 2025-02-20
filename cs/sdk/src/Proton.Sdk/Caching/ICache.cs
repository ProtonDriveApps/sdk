namespace Proton.Sdk.Caching;

public interface ICache<TKey, TValue>
    where TKey : notnull
{
    ValueTask SetAsync(TKey key, TValue value, CancellationToken cancellationToken);

    ValueTask<TValue> GetOrCreateAsync(
        TKey key,
        TValue value,
        Func<TKey, CancellationToken, ValueTask<TValue>> factory,
        IEnumerable<string>? tags = null,
        CancellationToken cancellationToken = default);

    IAsyncEnumerable<TValue> QueryAsync(IEnumerable<string> tags, CancellationToken cancellationToken);
}
