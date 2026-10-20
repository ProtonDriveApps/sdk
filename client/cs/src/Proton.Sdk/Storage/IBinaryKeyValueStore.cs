namespace Proton.Sdk.Storage;

/// <summary>
/// Opaque string-keyed byte storage. Entries are retained until explicitly removed or the store is cleared.
/// </summary>
public interface IBinaryKeyValueStore : IAsyncDisposable
{
    ValueTask SetAsync(string key, ReadOnlyMemory<byte> value, CancellationToken cancellationToken = default);

    ValueTask<byte[]?> TryGetAsync(string key, CancellationToken cancellationToken = default);

    ValueTask RemoveAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>
    /// Removes every entry whose key starts with <paramref name="prefix"/>, compared ordinally.
    /// </summary>
    ValueTask RemoveByPrefixAsync(string prefix, CancellationToken cancellationToken = default);

    ValueTask ClearAsync();
}
