using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class NodeProvider(
    ProtonDriveClient client,
    Func<VolumeId, IEnumerable<LinkId>, CancellationToken, ValueTask<LinkDetailsResponse>> getLinkDetailsAsync,
    int? batchSizeOverride = null) : INodeProvider
{
    private const int DefaultBatchSize = 50;

    private readonly ProtonDriveClient _client = client;
    private readonly Func<VolumeId, IEnumerable<LinkId>, CancellationToken, ValueTask<LinkDetailsResponse>> _getLinkDetailsAsync = getLinkDetailsAsync;
    private readonly int _batchSize = batchSizeOverride ?? DefaultBatchSize;
    private readonly ILogger _logger = client.Telemetry.GetLogger("Node provider");

    private readonly SemaphoreSlim _batchSemaphore = new(1, 1);

    private enum NodeEnumerationPhase
    {
        EnumerateAndFetch,
        CacheHitsAvailable,
        FetchResultsAvailable,
        Finished,
    }

    public async IAsyncEnumerable<(T Item, Result<NodeOperationData, Exception> Result)> EnumerateNodeOperationDataAsync<T>(
        VolumeId volumeId,
        IEnumerable<(T Item, LinkId LinkId)> itemLinkIdPairs,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await foreach (var result in EnumerateAsync(
            volumeId,
            itemLinkIdPairs,
            metadata => metadata.OperationData,
            ProbeOperationDataCacheAsync,
            cancellationToken).ConfigureAwait(false))
        {
            yield return result;
        }
    }

    public async IAsyncEnumerable<(T Item, Result<NodeMetadata, Exception> Result)> EnumerateNodeMetadataAsync<T>(
        VolumeId volumeId,
        IEnumerable<(T Item, LinkId LinkId)> itemLinkIdPairs,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await foreach (var result in EnumerateAsync(
            volumeId,
            itemLinkIdPairs,
            metadata => metadata,
            static (_, _, _) => ValueTask.FromResult(Option<NodeMetadata>.None),
            cancellationToken).ConfigureAwait(false))
        {
            yield return result;
        }
    }

    private async IAsyncEnumerable<(TItem Item, Result<TValue, Exception> Result)> EnumerateAsync<TItem, TValue>(
        VolumeId volumeId,
        IEnumerable<(TItem Item, LinkId LinkId)> itemLinkIdPairs,
        Func<NodeMetadata, TValue> getValue,
        Func<VolumeId, LinkId, CancellationToken, ValueTask<Option<TValue>>> tryGetCachedValueAsync,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var state = new NodeEnumerationState<TItem, TValue>(volumeId, itemLinkIdPairs, _batchSize);

        while (true)
        {
            // We're using a state machine to avoid yielding back to the caller within the semaphore scope,
            // otherwise the caller might block before enumerating the next item,
            // which in turn would block other threads waiting on the semaphore to fetch their batches.
            switch (state.Phase)
            {
                case NodeEnumerationPhase.EnumerateAndFetch:
                    await _batchSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

                    try
                    {
                        await state.EnumerateAndFetchAsync(
                            tryGetCachedValueAsync,
                            (batchVolumeId, batchToFetch) => FetchBatchAsync(batchVolumeId, batchToFetch, cancellationToken),
                            cancellationToken).ConfigureAwait(false);
                    }
                    finally
                    {
                        _batchSemaphore.Release();
                    }

                    break;

                case NodeEnumerationPhase.CacheHitsAvailable:
                    foreach (var (item, value) in state.CacheHits)
                    {
                        yield return (item, value);
                    }

                    state.ClearCacheHits();
                    break;

                case NodeEnumerationPhase.FetchResultsAvailable:
                    foreach (var result in state.EnumerateFetchResults(getValue))
                    {
                        yield return result;
                    }

                    state.ClearFetchBatch();
                    break;

                case NodeEnumerationPhase.Finished:
                    yield break;
            }
        }
    }

    private async ValueTask<Option<NodeOperationData>> ProbeOperationDataCacheAsync(
        VolumeId volumeId,
        LinkId linkId,
        CancellationToken cancellationToken)
    {
        return await _client.Cache.TryGetNodeOperationDataAsync(new NodeUid(volumeId, linkId), cancellationToken).ConfigureAwait(false);
    }

    private async Task FetchBatchAsync(
        VolumeId volumeId,
        Dictionary<LinkId, Result<NodeMetadata, Exception>?> batch,
        CancellationToken cancellationToken)
    {
        var response = await _getLinkDetailsAsync(volumeId, batch.Keys, cancellationToken).ConfigureAwait(false);

        foreach (var linkDetails in response.Links)
        {
            var linkId = linkDetails.Link.Id;

            if (!batch.ContainsKey(linkId))
            {
                continue;
            }

            batch[linkId] = await ConvertLinkDetailsToMetadataAsync(volumeId, linkDetails, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<Result<NodeMetadata, Exception>> ConvertLinkDetailsToMetadataAsync(
        VolumeId volumeId,
        LinkDetailsDto linkDetails,
        CancellationToken cancellationToken)
    {
        try
        {
            var passphraseDecryptionKey = await GetNodePassphraseDecryptionKeyAsync(volumeId, linkDetails, cancellationToken).ConfigureAwait(false);

            var conversionResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                _client,
                volumeId,
                linkDetails,
                passphraseDecryptionKey,
                cancellationToken).ConfigureAwait(false);

            await _client.Cache.SetNodeOperationDataAsync(conversionResult.Metadata.Node.Uid, conversionResult.Metadata.OperationData, cancellationToken)
                .ConfigureAwait(false);

            return conversionResult.Metadata;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return exception;
        }
    }

    private async ValueTask<PgpPrivateKey> GetNodePassphraseDecryptionKeyAsync(
        VolumeId volumeId,
        LinkDetailsDto linkDetails,
        CancellationToken cancellationToken)
    {
        if (linkDetails.Link.ParentId is null
            && linkDetails.Photo is { AlbumInclusions: { Count: > 0 } albumInclusions })
        {
            return await GetAlbumNodePassphraseDecryptionKeyAsync(
                volumeId,
                linkDetails,
                albumInclusions,
                cancellationToken).ConfigureAwait(false);
        }

        return await GetRegularNodePassphraseDecryptionKeyAsync(
            volumeId,
            linkDetails.Link.ParentId,
            linkDetails.Sharing?.ShareId,
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<PgpPrivateKey> GetRegularNodePassphraseDecryptionKeyAsync(
        VolumeId volumeId,
        LinkId? parentId,
        ShareId? shareId,
        CancellationToken cancellationToken)
    {
        var currentId = parentId;
        var currentShareId = shareId;
        var linkAncestry = new Stack<LinkDetailsDto>(8);
        var visitedLinkIds = new HashSet<LinkId>();
        PgpPrivateKey? lastKey = null;

        while (currentId is not null)
        {
            if (!visitedLinkIds.Add(currentId.Value))
            {
                throw new InvalidOperationException($"Cyclic parent structure detected while resolving node {new NodeUid(volumeId, currentId.Value)}");
            }

            var nodeUid = new NodeUid(volumeId, currentId.Value);

            var operationDataOrNone = await _client.Cache.TryGetNodeOperationDataAsync(nodeUid, cancellationToken).ConfigureAwait(false);

            if (operationDataOrNone.TryGetValue(out var operationData))
            {
                if (operationData.Key is null)
                {
                    throw new InvalidOperationException($"Folder node does not have a key: {nodeUid}");
                }

                lastKey = operationData.Key;
                break;
            }

            var response = await _client.Api.Links.GetDetailsAsync(volumeId, [currentId.Value], cancellationToken).ConfigureAwait(false);

            var linkDetails = response.Links is { Count: > 0 } links
                ? links[0]
                : throw new NodeNotFoundException(nodeUid);

            linkAncestry.Push(linkDetails);

            currentShareId = linkDetails.Sharing?.ShareId;
            currentId = linkDetails.Link.ParentId;
        }

        if (lastKey is not { } currentParentKey)
        {
            if (currentShareId is null)
            {
                throw new InvalidOperationException("No share available to access node");
            }

            (_, currentParentKey) = await ShareOperations.GetShareAsync(_client, currentShareId.Value, cancellationToken).ConfigureAwait(false);
        }

        while (linkAncestry.TryPop(out var ancestorLinkDetails))
        {
            var conversionResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                _client,
                volumeId,
                ancestorLinkDetails,
                currentParentKey,
                cancellationToken).ConfigureAwait(false);

            await _client.Cache.SetNodeOperationDataAsync(conversionResult.Metadata.Node.Uid, conversionResult.Metadata.OperationData, cancellationToken)
                .ConfigureAwait(false);

            currentParentKey = conversionResult.Metadata.GetFolderKeyOrThrow();
        }

        return currentParentKey;
    }

    private async Task<PgpPrivateKey> GetAlbumNodePassphraseDecryptionKeyAsync(
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        IReadOnlyList<PhotoAlbumInclusionDto> albumInclusions,
        CancellationToken cancellationToken)
    {
        foreach (var albumInclusionId in albumInclusions.Select(albumInclusion => albumInclusion.Id))
        {
            try
            {
                return await GetRegularNodePassphraseDecryptionKeyAsync(
                    volumeId,
                    albumInclusionId,
                    linkDetailsDto.Sharing?.ShareId,
                    cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Album \"{Uid}\" not found", new NodeUid(volumeId, albumInclusionId));
            }
        }

        throw new InvalidOperationException("No album node passphrase decryption key found");
    }

    private sealed class NodeEnumerationState<TItem, TValue> : IDisposable
    {
        private readonly VolumeId _volumeId;
        private readonly List<(TItem Item, LinkId LinkId)> _itemsWaitingForFetch;
        private readonly int _batchSize;
        private readonly IEnumerator<(TItem Item, LinkId LinkId)> _itemEnumerator;
        private readonly List<(TItem Item, TValue Value)> _cacheHits;
        private readonly Dictionary<LinkId, Result<NodeMetadata, Exception>?> _batchToFetch;
        private NodeEnumerationPhase _phase;
        private bool _hasRemainingItems;
        private bool _fetchResultsPending;

        public NodeEnumerationState(VolumeId volumeId, IEnumerable<(TItem Item, LinkId LinkId)> itemLinkIdPairs, int batchSize)
        {
            _volumeId = volumeId;
            _batchSize = batchSize;
            _itemsWaitingForFetch = new List<(TItem Item, LinkId LinkId)>(batchSize);
            _itemEnumerator = itemLinkIdPairs.GetEnumerator();
            _cacheHits = new List<(TItem Item, TValue Value)>(batchSize);
            _batchToFetch = new Dictionary<LinkId, Result<NodeMetadata, Exception>?>(batchSize);
            _hasRemainingItems = _itemEnumerator.MoveNext();
            _phase = NodeEnumerationPhase.EnumerateAndFetch;
        }

        public NodeEnumerationPhase Phase => _phase;

        public IReadOnlyList<(TItem Item, TValue Value)> CacheHits => _cacheHits;

        public async ValueTask EnumerateAndFetchAsync(
            Func<VolumeId, LinkId, CancellationToken, ValueTask<Option<TValue>>> tryGetCachedValueAsync,
            Func<VolumeId, Dictionary<LinkId, Result<NodeMetadata, Exception>?>, Task> fetchBatchAsync,
            CancellationToken cancellationToken)
        {
            while (_hasRemainingItems && CanAcceptMoreItems())
            {
                var (currentItem, linkId) = _itemEnumerator.Current;

                var cachedValue = await tryGetCachedValueAsync(_volumeId, linkId, cancellationToken).ConfigureAwait(false);

                if (cachedValue.TryGetValue(out var value))
                {
                    _cacheHits.Add((currentItem, value));
                }
                else
                {
                    _itemsWaitingForFetch.Add(_itemEnumerator.Current);
                    _batchToFetch.TryAdd(linkId, null);
                }

                _hasRemainingItems = _itemEnumerator.MoveNext();
            }

            if (IsReadyToFetch())
            {
                await fetchBatchAsync(_volumeId, _batchToFetch).ConfigureAwait(false);
                _fetchResultsPending = true;
            }

            AdvanceFromEnumerateAndFetch();
        }

        public void ClearCacheHits()
        {
            _cacheHits.Clear();
            AdvanceFromCacheHitsAvailable();
        }

        public void ClearFetchBatch()
        {
            _itemsWaitingForFetch.Clear();
            _batchToFetch.Clear();
            _fetchResultsPending = false;
            AdvanceFromFetchResultsAvailable();
        }

        public IEnumerable<(TItem Item, Result<TValue, Exception> Result)> EnumerateFetchResults(Func<NodeMetadata, TValue> getValue)
        {
            foreach (var (item, linkId) in _itemsWaitingForFetch)
            {
                if (!_batchToFetch.TryGetValue(linkId, out var metadataResult) || metadataResult is null)
                {
                    yield return (item, new NodeNotFoundException(new NodeUid(_volumeId, linkId)));
                    continue;
                }

                yield return (item, metadataResult.Value.Convert(getValue, error => error));
            }
        }

        public void Dispose() => _itemEnumerator.Dispose();

        private bool CanAcceptMoreItems() => _hasRemainingItems && _batchToFetch.Count < _batchSize && _cacheHits.Count < _batchSize;

        private bool IsReadyToFetch() => _batchToFetch.Count >= _batchSize || (!_hasRemainingItems && _batchToFetch.Count > 0);

        private void AdvanceFromEnumerateAndFetch()
        {
            if (_cacheHits.Count > 0)
            {
                _phase = NodeEnumerationPhase.CacheHitsAvailable;
                return;
            }

            if (_fetchResultsPending)
            {
                _phase = NodeEnumerationPhase.FetchResultsAvailable;
                return;
            }

            _phase = NodeEnumerationPhase.Finished;
        }

        private void AdvanceFromCacheHitsAvailable()
        {
            if (_fetchResultsPending)
            {
                _phase = NodeEnumerationPhase.FetchResultsAvailable;
                return;
            }

            if (_hasRemainingItems && _batchToFetch.Count < _batchSize)
            {
                _phase = NodeEnumerationPhase.EnumerateAndFetch;
                return;
            }

            _phase = NodeEnumerationPhase.Finished;
        }

        private void AdvanceFromFetchResultsAvailable()
        {
            _phase = _hasRemainingItems
                ? NodeEnumerationPhase.EnumerateAndFetch
                : NodeEnumerationPhase.Finished;
        }
    }
}
