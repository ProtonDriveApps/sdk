using System.Collections.Concurrent;

namespace Proton.Sdk.Storage;

/// <summary>
/// Memory-backed key-value store that holds no unmanaged resources, so it does not need to be disposed.
/// Entries are lost once the store is no longer referenced.
/// </summary>
public sealed class InMemoryBinaryKeyValueStore : IBinaryKeyValueStore
{
    private readonly ConcurrentDictionary<string, byte[]> _entries = new(StringComparer.Ordinal);

    public ValueTask SetAsync(string key, ReadOnlyMemory<byte> value, CancellationToken cancellationToken = default)
    {
        _entries[key] = value.ToArray();
        return ValueTask.CompletedTask;
    }

    public ValueTask<byte[]?> TryGetAsync(string key, CancellationToken cancellationToken = default)
    {
        var value = _entries.TryGetValue(key, out var storedValue) ? storedValue.ToArray() : null;
        return ValueTask.FromResult(value);
    }

    public ValueTask RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        _entries.TryRemove(key, out _);
        return ValueTask.CompletedTask;
    }

    public ValueTask RemoveByPrefixAsync(string prefix, CancellationToken cancellationToken = default)
    {
        foreach (var key in _entries.Keys.Where(key => key.StartsWith(prefix, StringComparison.Ordinal)))
        {
            _entries.TryRemove(key, out _);
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask ClearAsync()
    {
        _entries.Clear();
        return ValueTask.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }
}
