using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace Proton.Sdk.Caching;

internal static class CacheRepositoryExtensions
{
    private const string CompleteTagCacheKeyFormat = "cache:tag:{0}:complete";

    public static ValueTask SetAsync(this ICacheRepository repository, string key, string value, CancellationToken cancellationToken)
    {
        return repository.SetAsync(key, value, [], cancellationToken);
    }

    public static async ValueTask SetCompleteCollection<T>(
        this ICacheRepository repository,
        IEnumerable<T> values,
        Func<T, string> getCacheKeyFunction,
        IReadOnlyList<string> tags,
        JsonTypeInfo<T> jsonTypeInfo,
        CancellationToken cancellationToken)
    {
        foreach (var value in values)
        {
            var serializedValue = JsonSerializer.Serialize(value, jsonTypeInfo);

            var cacheKey = getCacheKeyFunction.Invoke(value);

            await repository.SetAsync(cacheKey, serializedValue, tags, cancellationToken).ConfigureAwait(false);
        }

        await repository.MarkTagAsCompleteAsync(tags[0], cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<IReadOnlyList<T>?> TryGetCompleteCollection<T>(
        this ICacheRepository repository,
        IReadOnlyList<string> tags,
        JsonTypeInfo<T> jsonTypeInfo,
        CancellationToken cancellationToken)
    {
        if (!await repository.GetTagIsCompleteAsync(tags[0], cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var entries = repository.GetByTagsAsync(tags, cancellationToken);

        var deserializedValues = new List<T>();

        await foreach (var entry in entries.ConfigureAwait(false))
        {
            try
            {
                var deserializedValue = JsonSerializer.Deserialize(entry.Value, jsonTypeInfo);
                if (deserializedValue is null)
                {
                    return null;
                }

                deserializedValues.Add(deserializedValue);
            }
            catch
            {
                // There is something wrong with the cache, remove the problematic entry, and return null to incite the caller to refresh the collection
                await repository.RemoveAsync(entry.Key, cancellationToken).ConfigureAwait(false);

                return null;
            }
        }

        return deserializedValues;
    }

    /// <summary>
    /// Creates a cache entry that serves as a hint that querying by the given tag will return complete information.
    /// </summary>
    /// <remarks>
    /// This marking indicates that the results of a query by the given tag reflect the complete "truth" related to that tag at a point in time.
    /// Consequently, if that marking is present and the query by that tag returns an empty set, then that emptiness is the information, rather than a lack of information in cache.
    /// </remarks>
    private static async ValueTask MarkTagAsCompleteAsync(this ICacheRepository repository, string tag, CancellationToken cancellationToken)
    {
        var cacheKey = string.Format(CompleteTagCacheKeyFormat, tag);

        await repository.SetAsync(cacheKey, string.Empty, cancellationToken).ConfigureAwait(false);
    }

    private static async ValueTask<bool> GetTagIsCompleteAsync(this ICacheRepository repository, string tag, CancellationToken cancellationToken)
    {
        var cacheKey = string.Format(CompleteTagCacheKeyFormat, tag);

        return await repository.TryGetAsync(cacheKey, cancellationToken).ConfigureAwait(false) is not null;
    }
}
