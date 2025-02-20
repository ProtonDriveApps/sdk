namespace Proton.Sdk.Caching;

internal sealed class NullCache<TKey, TValue> : ICache<TKey, TValue>
    where TKey : notnull
{
    public ValueTask SetAsync(TKey key, TValue value, CancellationToken cancellationToken)
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask<TValue> GetOrCreateAsync(
        TKey key,
        TValue value,
        Func<TKey, CancellationToken, ValueTask<TValue>> factory,
        IEnumerable<string>? tags = null,
        CancellationToken cancellationToken = default)
    {
        return factory.Invoke(key, cancellationToken);
    }

    public IAsyncEnumerable<TValue> QueryAsync(IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        return AsyncEnumerable.Empty<TValue>();
    }
}
