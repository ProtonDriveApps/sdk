using Proton.Drive.Sdk.Search.Abstractions;
using Proton.Sdk.Storage;

namespace Proton.Drive.Sdk.Search;

internal sealed class BinaryKeyValueSearchIndexStore(IBinaryKeyValueStore keyValueStore, string keyPrefix) : ISearchIndexStore
{
    public const string DefaultKeyPrefix = "search-index";

    private readonly IBinaryKeyValueStore _keyValueStore = keyValueStore;
    private readonly string _storageKeyPrefix = $"{keyPrefix}:";

    public ValueTask StoreAsync(SearchIndexKey key, ReadOnlyMemory<byte> value, CancellationToken cancellationToken)
    {
        return _keyValueStore.SetAsync(BuildStorageKey(key), value, cancellationToken);
    }

    public ValueTask<byte[]?> LoadAsync(SearchIndexKey key, CancellationToken cancellationToken)
    {
        return _keyValueStore.TryGetAsync(BuildStorageKey(key), cancellationToken);
    }

    public ValueTask RemoveAsync(SearchIndexKey key, CancellationToken cancellationToken)
    {
        return _keyValueStore.RemoveAsync(BuildStorageKey(key), cancellationToken);
    }

    public ValueTask ClearAsync(CancellationToken cancellationToken)
    {
        return _keyValueStore.RemoveByPrefixAsync(_storageKeyPrefix, cancellationToken);
    }

    private string BuildStorageKey(SearchIndexKey key)
    {
        return _storageKeyPrefix + SearchMappers.ToKeyString(key);
    }
}
