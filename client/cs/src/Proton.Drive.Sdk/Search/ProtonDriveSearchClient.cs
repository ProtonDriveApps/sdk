using Proton.Sdk.Storage;
using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;
using SearchNodeUid = Proton.Drive.Sdk.Search.NodeUid;

namespace Proton.Drive.Sdk.Search;

internal sealed class ProtonDriveSearchClient : IDisposable
{
    public static readonly TimeSpan DefaultDrainedRunNextCallAfter = TimeSpan.FromMinutes(5);

    private static readonly SearchIndex[] AllEngineIndexes = [SearchIndex.Recent];

    private readonly DriveSearchEngine _searchEngine;
    private readonly DriveExtractEngine _extractEngine;

    private ProtonDriveSearchClient(DriveSearchEngine searchEngine, DriveExtractEngine extractEngine)
    {
        _searchEngine = searchEngine;
        _extractEngine = extractEngine;
    }

    public DriveSearchEngine SearchEngine => _searchEngine;

    public static async Task<ProtonDriveSearchClient> CreateAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(client);

        var keyValueStore = client.SearchIndexStore ?? new InMemoryBinaryKeyValueStore();

        var (searchEngine, extractEngine, _) = SearchEngineFactory.CreateEngines(client, keyValueStore);

        try
        {
            try
            {
                await searchEngine.Init(cancellationToken).ConfigureAwait(false);
            }
            catch (SearchEngineErrorException exception) when (exception.Error is SearchEngineError.ReindexRequired)
            {
                // The engine already discarded the unreadable stored index and is initialized over an empty one,
                // which the next index update fills again from the backend.
            }

            await searchEngine.SetEnabled(true, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            // The next search call creates new engines, so these ones are released now rather than at finalization.
            searchEngine.Dispose();
            extractEngine.Dispose();
            throw SearchExceptionMapper.ToProtonDriveException(exception);
        }

        return new ProtonDriveSearchClient(searchEngine, extractEngine);
    }

    public async Task<DriveSearchWorkSchedule> UpdateSearchIndexesAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await _searchEngine.IndexFromQueue(cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                throw SearchExceptionMapper.ToProtonDriveException(exception);
            }

            if (!await AnyIndexActiveAsync(_searchEngine, cancellationToken).ConfigureAwait(false))
            {
                break;
            }
        }

        return new DriveSearchWorkSchedule(DefaultDrainedRunNextCallAfter);
    }

    public async Task<DriveSearchWorkSchedule> ProcessSearchExtractionQueueAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await _extractEngine.ExtractFromQueue(cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                throw SearchExceptionMapper.ToProtonDriveException(exception);
            }

            var debugInfo = _extractEngine.DebugInfo();
            if (debugInfo.QueueEmpty)
            {
                break;
            }
        }

        return new DriveSearchWorkSchedule(DefaultDrainedRunNextCallAfter);
    }

    public async Task RemoveNodeFromSearchIndexesAsync(IReadOnlyList<ProtonDriveNodeUid> deletedNodeUids, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(deletedNodeUids);

        var nodeUids = ToSearchNodeUids(deletedNodeUids);

        try
        {
            await _searchEngine.Delete(nodeUids, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            throw SearchExceptionMapper.ToProtonDriveException(exception);
        }
    }

    public void Dispose()
    {
        _searchEngine.Dispose();
        _extractEngine.Dispose();
    }

    private static async Task<bool> AnyIndexActiveAsync(DriveSearchEngine searchEngine, CancellationToken cancellationToken)
    {
        foreach (var index in AllEngineIndexes)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var debugInfo = await searchEngine.DebugInfo(index, cancellationToken).ConfigureAwait(false);
            if (debugInfo.Status is IndexStatus.Active)
            {
                return true;
            }
        }

        return false;
    }

    private static SearchNodeUid[] ToSearchNodeUids(IReadOnlyList<ProtonDriveNodeUid> nodeUids)
    {
        return [.. nodeUids.Select(SearchNodeUidMapping.ToSearchNodeUid)];
    }
}
