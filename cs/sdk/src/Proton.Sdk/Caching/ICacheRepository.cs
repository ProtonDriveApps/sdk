namespace Proton.Sdk.Caching;

public interface ICacheRepository : IAsyncDisposable
{
    ValueTask SetAsync(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken);

    ValueTask RemoveAsync(string key, CancellationToken cancellationToken);

    ValueTask RemoveByTagAsync(string tag, CancellationToken cancellationToken);

    ValueTask ClearAsync();

    ValueTask<string?> TryGetAsync(string key, CancellationToken cancellationToken);

    IAsyncEnumerable<(string Key, string Value)> GetByTagsAsync(IEnumerable<string> tags, CancellationToken cancellationToken = default);
}
