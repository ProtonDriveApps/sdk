namespace Proton.Drive.Sdk.Search.Abstractions;

internal interface ISearchIndexStore
{
    ValueTask StoreAsync(SearchIndexKey key, ReadOnlyMemory<byte> value, CancellationToken cancellationToken);

    ValueTask<byte[]?> LoadAsync(SearchIndexKey key, CancellationToken cancellationToken);

    ValueTask RemoveAsync(SearchIndexKey key, CancellationToken cancellationToken);

    ValueTask ClearAsync(CancellationToken cancellationToken);
}
