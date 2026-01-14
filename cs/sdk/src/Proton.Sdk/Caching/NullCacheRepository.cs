namespace Proton.Sdk.Caching;

internal sealed class NullCacheRepository : ICacheRepository
{
    public static readonly NullCacheRepository Instance = new();

    public ValueTask SetAsync(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask RemoveAsync(string key, CancellationToken cancellationToken)
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask RemoveByTagAsync(string tag, CancellationToken cancellationToken)
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask ClearAsync()
    {
        return ValueTask.CompletedTask;
    }

    public ValueTask<string?> TryGetAsync(string key, CancellationToken cancellationToken)
    {
        return ValueTask.FromResult(default(string?));
    }

    public IAsyncEnumerable<(string Key, string Value)> GetByTagsAsync(IEnumerable<string> tags, CancellationToken cancellationToken = default)
    {
        return AsyncEnumerable.Empty<(string, string)>();
    }

    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }
}
