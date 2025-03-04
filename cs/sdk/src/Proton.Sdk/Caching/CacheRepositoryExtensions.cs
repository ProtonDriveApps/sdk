namespace Proton.Sdk.Caching;

internal static class CacheRepositoryExtensions
{
    private const string CompleteTagCacheKeyFormat = "cache:complete-tag:{0}";

    public static ValueTask SetAsync(this ICacheRepository repository, string key, string value, CancellationToken cancellationToken)
    {
        return repository.SetAsync(key, value, [], cancellationToken);
    }

    /// <summary>
    /// Creates a cache entry that serves as a hint that querying by the given tag will return complete information.
    /// </summary>
    /// <remarks>
    /// This marking indicates that the results of a query by the given tag reflect the complete "truth" related to that tag at a point in time.
    /// Consequently, if that marking is present and the query by that tag returns an empty set, then that emptiness is the information, rather than a lack of information in cache.
    /// </remarks>
    public static async ValueTask MarkTagAsCompleteAsync(this ICacheRepository repository, string tag, CancellationToken cancellationToken)
    {
        var cacheKey = string.Format(CompleteTagCacheKeyFormat, tag);

        await repository.SetAsync(cacheKey, string.Empty, cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<bool> GetTagIsCompleteAsync(this ICacheRepository repository, string tag, CancellationToken cancellationToken)
    {
        var cacheKey = string.Format(CompleteTagCacheKeyFormat, tag);

        return await repository.TryGetAsync(cacheKey, cancellationToken).ConfigureAwait(false) is not null;
    }

    public static async ValueTask UnmarkTagAsCompleteAsync(this ICacheRepository repository, string tag, CancellationToken cancellationToken)
    {
        var cacheKey = string.Format(CompleteTagCacheKeyFormat, tag);

        await repository.RemoveAsync(cacheKey, cancellationToken).ConfigureAwait(false);
    }
}
