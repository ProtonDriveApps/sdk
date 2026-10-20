using Proton.Drive.Sdk.Search.Abstractions;

namespace Proton.Drive.Sdk.Search;

internal sealed class SearchIndexStoreBridge(ISearchIndexStore inner) : Storage
{
    private readonly ISearchIndexStore _inner = inner;

    public async Task<Ack> Store(StorageKey key, byte[] val)
    {
        try
        {
            await _inner.StoreAsync(
                SearchMappers.ToSearchIndexKey(key),
                val,
                CancellationToken.None).ConfigureAwait(false);
            return default;
        }
        catch (Exception exception)
        {
            throw new StorageErrorException(SearchExceptionMapper.ToStorageError(exception, SearchIndexStoreOperation.Store));
        }
    }

    public async Task<byte[]?> Load(StorageKey key)
    {
        try
        {
            return await _inner.LoadAsync(
                SearchMappers.ToSearchIndexKey(key),
                CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            throw new StorageErrorException(SearchExceptionMapper.ToStorageError(exception, SearchIndexStoreOperation.Load));
        }
    }

    public async Task<Ack> Remove(StorageKey key)
    {
        try
        {
            await _inner.RemoveAsync(
                SearchMappers.ToSearchIndexKey(key),
                CancellationToken.None).ConfigureAwait(false);
            return default;
        }
        catch (Exception exception)
        {
            throw new StorageErrorException(SearchExceptionMapper.ToStorageError(exception, SearchIndexStoreOperation.Remove));
        }
    }

    public async Task<Ack> RemoveAll()
    {
        try
        {
            await _inner.ClearAsync(CancellationToken.None).ConfigureAwait(false);
            return default;
        }
        catch (Exception exception)
        {
            throw new StorageErrorException(SearchExceptionMapper.ToStorageError(exception, SearchIndexStoreOperation.Clear));
        }
    }
}
