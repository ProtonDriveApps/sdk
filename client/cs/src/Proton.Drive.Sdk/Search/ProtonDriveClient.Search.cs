using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Threading.Channels;
using Proton.Drive.Sdk.Search;
using Proton.Sdk.Storage;
using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;

namespace Proton.Drive.Sdk;

public sealed partial class ProtonDriveClient
{
    private readonly IBinaryKeyValueStore? _searchIndexStore;
    private readonly SemaphoreSlim _searchClientCreationLock = new(1, 1);
    private ProtonDriveSearchClient? _searchClient;

    internal IBinaryKeyValueStore? SearchIndexStore => _searchIndexStore;

    /// <summary>
    /// Downloads pending extracts from the backend and updates local search indexes.
    /// </summary>
    [Experimental("Search")]
    public async Task<DriveSearchWorkSchedule> UpdateSearchIndexesAsync(CancellationToken cancellationToken = default)
    {
        var search = await GetSearchClientAsync(cancellationToken).ConfigureAwait(false);
        return await search.UpdateSearchIndexesAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Processes the backend extraction queue: loads node data, runs extractors, and sends extracts to the backend.
    /// </summary>
    [Experimental("Search")]
    public async Task<DriveSearchWorkSchedule> ProcessSearchExtractionQueueAsync(CancellationToken cancellationToken = default)
    {
        var search = await GetSearchClientAsync(cancellationToken).ConfigureAwait(false);
        return await search.ProcessSearchExtractionQueueAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Removes deleted nodes from all local search indexes.
    /// </summary>
    [Experimental("Search")]
    public async Task RemoveNodeFromSearchIndexesAsync(IReadOnlyList<ProtonDriveNodeUid> deletedNodeUids, CancellationToken cancellationToken = default)
    {
        var search = await GetSearchClientAsync(cancellationToken).ConfigureAwait(false);
        await search.RemoveNodeFromSearchIndexesAsync(deletedNodeUids, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Queries a logical index and streams hits as they are found.
    /// </summary>
    [Experimental("Search")]
    public IAsyncEnumerable<DriveSearchHit> QueryAsync(
        DriveSearchLogicalIndex index,
        DriveSearchQuery query,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        return EnumerateSearchHitsAsync(index, query, cancellationToken);
    }

    /// <summary>
    /// Releases the native search engines, if they were created, when the client is freed.
    /// The client must not be used for search afterwards.
    /// </summary>
    internal void DisposeSearchClient()
    {
        Interlocked.Exchange(ref _searchClient, null)?.Dispose();
    }

    /// <summary>
    /// Returns the search client, creating it on first use.
    /// Only a successfully created client is kept, so a failed creation is attempted again by the next call.
    /// </summary>
    private async ValueTask<ProtonDriveSearchClient> GetSearchClientAsync(CancellationToken cancellationToken)
    {
        if (Volatile.Read(ref _searchClient) is { } searchClient)
        {
            return searchClient;
        }

        await _searchClientCreationLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            if (_searchClient is { } createdByAnotherCaller)
            {
                return createdByAnotherCaller;
            }

            var createdSearchClient = await ProtonDriveSearchClient.CreateAsync(this, cancellationToken).ConfigureAwait(false);
            Volatile.Write(ref _searchClient, createdSearchClient);
            return createdSearchClient;
        }
        finally
        {
            _searchClientCreationLock.Release();
        }
    }

    private async IAsyncEnumerable<DriveSearchHit> EnumerateSearchHitsAsync(
        DriveSearchLogicalIndex index,
        DriveSearchQuery query,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var search = await GetSearchClientAsync(cancellationToken).ConfigureAwait(false);
        var channel = Channel.CreateUnbounded<DriveSearchHit>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = true,
        });

        var engineQuery = DriveSearchQueryMapper.ToEngineQuery(query);
        var engineIndex = DriveSearchQueryMapper.ToEngineIndex(index);

        using var searchCancellationSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        var searchTask = ProtonDriveClientSearchQueryRunner.RunQueryAsync(
            search.SearchEngine,
            engineIndex,
            engineQuery,
            channel,
            searchCancellationSource.Token);

        try
        {
            await foreach (var hit in channel.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
            {
                yield return hit;
            }
        }
        finally
        {
            // Stops the search when the consumer stops early, and keeps it from outliving the enumerator.
            await searchCancellationSource.CancelAsync().ConfigureAwait(false);
            await searchTask.ConfigureAwait(false);
        }
    }
}
