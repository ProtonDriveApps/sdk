using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Move;

internal static class NodeMoveOperation
{
    private const int MaximumBatchSize = 150;

    public static async IAsyncEnumerable<NodeMoveResult> MoveMultipleAsync(
        ProtonDriveClient client,
        IEnumerable<NodeMoveItem> items,
        NodeUid targetParentUid,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, targetParentUid, cancellationToken).ConfigureAwait(false);

        using var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var volumeId = targetParentUid.VolumeId;

        var (targetParentKey, targetParentHashKey) =
            await FolderOperations.GetKeyAndHashKeyAsync(client, targetParentUid, cancellationToken).ConfigureAwait(false);

        var batch = new MoveBatch(MaximumBatchSize);

        var itemsWithOperationData = client.NodeProvider.EnumerateNodeOperationDataAsync(
            volumeId,
            items.Select(item => (item, item.NodeUid.LinkId)),
            cancellationToken).ConfigureAwait(false);

        await foreach (var (item, operationDataResult) in itemsWithOperationData)
        {
            if (NodeOperations.ValidateName(item.TargetName) is { } validationException)
            {
                yield return new NodeMoveResult(item.NodeUid, validationException);
                continue;
            }

            if (item.NodeUid.VolumeId != volumeId)
            {
                yield return new NodeMoveResult(item.NodeUid, new InvalidOperationException($"Node {item.NodeUid} cannot have {targetParentUid} as parent"));
                continue;
            }

            if (!operationDataResult.TryGetValueElseError(out var operationData, out var loadError))
            {
                yield return new NodeMoveResult(item.NodeUid, loadError);
                continue;
            }

            await foreach (var moveResult in PrepareItemAndAddToBatchAsync(
                    client,
                    item,
                    operationData,
                    volumeId,
                    targetParentUid,
                    membershipAddress.EmailAddress,
                    targetParentKey,
                    targetParentHashKey,
                    signingKey,
                    batch,
                    cancellationToken).ConfigureAwait(false))
            {
                yield return moveResult;
            }
        }

        while (batch.Items.Count > 0)
        {
            await foreach (var moveResult in SubmitBatchAsync(
                client,
                volumeId,
                targetParentUid,
                membershipAddress.EmailAddress,
                batch,
                cancellationToken).ConfigureAwait(false))
            {
                yield return moveResult;
            }
        }
    }

    internal static Exception MapItemErrorToException(VolumeId volumeId, NodeUid targetParentUid, NodeUid movedNodeUid, DetailedApiResponse response)
    {
        return response.Code switch
        {
            DriveApiResponseCodes.AlreadyExists =>
                new NodeWithSameNameExistsException(volumeId, response),

            DriveApiResponseCodes.DoesNotExist =>
                new ParentFolderNotFoundException(targetParentUid, response),

            DriveApiResponseCodes.TooManyChildren =>
                new FolderCapacityExceededException(targetParentUid, response),

            DriveApiResponseCodes.NestingTooDeep =>
                new FolderNestingTooDeepException(targetParentUid, response),

            DriveApiResponseCodes.IncompatibleState =>
                new CannotMoveFavoritePhotoFromShareException(movedNodeUid, response),

            DriveApiResponseCodes.InvalidRequirements =>
                new NodeOutOfSyncException(movedNodeUid, response),

            _ => new ProtonApiException(response),
        };
    }

    private static async IAsyncEnumerable<NodeMoveResult> PrepareItemAndAddToBatchAsync(
        ProtonDriveClient client,
        NodeMoveItem item,
        NodeOperationData operationData,
        VolumeId volumeId,
        NodeUid targetParentUid,
        string membershipEmailAddress,
        PgpPrivateKey targetParentKey,
        ReadOnlyMemory<byte> targetParentHashKey,
        PgpPrivateKey signingKey,
        MoveBatch batch,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var preparation = await TryPrepareItemAsync(
            client,
            item,
            operationData,
            targetParentKey,
            targetParentHashKey,
            signingKey,
            cancellationToken).ConfigureAwait(false);

        if (preparation.TryGetValueElseError(out var itemRequest, out var preparationError))
        {
            await foreach (var result in AddToBatchAsync(
                new PreparedNodeMoveItem(item, itemRequest, operationData.NodeWasSignedAnonymously(), CurrentNameDigestIsLocallyComputed: true),
                client,
                volumeId,
                targetParentUid,
                membershipEmailAddress,
                batch,
                cancellationToken).ConfigureAwait(false))
            {
                yield return result;
            }
        }
        else
        {
            yield return new NodeMoveResult(item.NodeUid, preparationError);
        }
    }

    private static async IAsyncEnumerable<NodeMoveResult> AddToBatchAsync(
        PreparedNodeMoveItem preparedItem,
        ProtonDriveClient client,
        VolumeId volumeId,
        NodeUid targetParentUid,
        string membershipEmailAddress,
        MoveBatch batch,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!batch.TryAddToCurrentBatch(preparedItem))
        {
            var results = SubmitBatchAsync(client, volumeId, targetParentUid, membershipEmailAddress, batch, cancellationToken);

            await foreach (var result in results.ConfigureAwait(false))
            {
                yield return result;
            }
        }
    }

    private static async IAsyncEnumerable<NodeMoveResult> SubmitBatchAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        NodeUid targetParentUid,
        string membershipEmailAddress,
        MoveBatch batch,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (batch.Items.Count == 0)
        {
            yield break;
        }

        var batchRequest = new MoveMultipleLinksRequest
        {
            NewParentLinkId = targetParentUid.LinkId,
            Batch = batch.Items.Select(item => item.Value.ApiRequest),
            NameSignatureEmailAddress = membershipEmailAddress,
            SignatureEmailAddress = batch.IsForAnonymouslySignedNodes is true ? membershipEmailAddress : null,
        };

        var aggregateResponse = await client.Api.Links.MoveMultipleAsync(volumeId, batchRequest, cancellationToken).ConfigureAwait(false);

        foreach (var (linkId, response) in aggregateResponse.Responses)
        {
            var nodeUid = new NodeUid(volumeId, linkId);

            if (!batch.Remove(linkId, out var item))
            {
                continue;
            }

            if (!response.IsSuccess)
            {
                if (!CanBeRetried(item.Value, response))
                {
                    yield return new NodeMoveResult(nodeUid, MapItemErrorToException(volumeId, targetParentUid, nodeUid, response));
                    continue;
                }

                var itemForRetryResult =
                    await PrepareItemWithRemoteNameDigestAsync(client, item.Value, response, cancellationToken).ConfigureAwait(false);

                if (!itemForRetryResult.TryGetValueElseError(out var itemForRetry, out var exception))
                {
                    yield return new NodeMoveResult(nodeUid, exception);
                    continue;
                }

                batch.QueueForNextBatch(itemForRetry);
                continue;
            }

            yield return new NodeMoveResult(nodeUid, Result<Exception>.Success);
        }

        foreach (var linkId in batch.Items.Keys)
        {
            var nodeUid = new NodeUid(volumeId, linkId);

            yield return new NodeMoveResult(nodeUid, new NodeNotFoundException(nodeUid));
        }

        batch.StartNextBatch();
        yield break;

        static bool CanBeRetried(PreparedNodeMoveItem item, ApiResponse response)
            => response.Code is DriveApiResponseCodes.InvalidRequirements && item.CurrentNameDigestIsLocallyComputed;
    }

    private static async ValueTask<Result<MoveMultipleLinksItem, Exception>> TryPrepareItemAsync(
        ProtonDriveClient client,
        NodeMoveItem item,
        NodeOperationData nodeOperationData,
        PgpPrivateKey targetParentKey,
        ReadOnlyMemory<byte> targetParentHashKey,
        PgpPrivateKey signingKey,
        CancellationToken cancellationToken)
    {
        try
        {
            var nameSessionKey = nodeOperationData.NameSessionKey
                ?? throw new InvalidOperationException($"Name session key not available for {item.NodeUid}");

            var passphraseSessionKey = nodeOperationData.PassphraseSessionKey
                ?? throw new InvalidOperationException($"Passphrase session key not available for {item.NodeUid}");

            var (_, currentParentHashKey) = await FolderOperations
                .GetKeyAndHashKeyAsync(client, item.CurrentParentUid, cancellationToken)
                .ConfigureAwait(false);

            NodeOperations.GetNameParameters(
                item.TargetName,
                targetParentKey,
                targetParentHashKey.Span,
                nameSessionKey,
                signingKey,
                out var encryptedName,
                out var nameDigest);

            var passphraseKeyPacket = targetParentKey.EncryptSessionKey(passphraseSessionKey);
            var currentNameHashDigest = NodeCrypto.HashNodeName(item.CurrentName, currentParentHashKey.Span);

            ReadOnlyMemory<byte>? passphraseSignature = null;

            if (nodeOperationData.PassphraseForAnonymousMove is { Length: > 0 } passphraseForAnonymousMove)
            {
                passphraseSignature = signingKey.Sign(passphraseForAnonymousMove.Span);
            }

            // TODO: set new media type
            var itemRequest = new MoveMultipleLinksItem
            {
                LinkId = item.NodeUid.LinkId,
                Passphrase = passphraseKeyPacket,
                Name = encryptedName,
                TargetNameDigest = nameDigest,
                CurrentNameDigest = currentNameHashDigest,
                PassphraseSignature = passphraseSignature,
            };

            return itemRequest;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return exception;
        }
    }

    private static async ValueTask<Result<PreparedNodeMoveItem, Exception>> PrepareItemWithRemoteNameDigestAsync(
        ProtonDriveClient client,
        PreparedNodeMoveItem rejectedItem,
        DetailedApiResponse response,
        CancellationToken cancellationToken)
    {
        NodeMetadata metadata;

        var (request, apiRequest, isSignedAnonymously, _) = rejectedItem;

        try
        {
            metadata = await NodeOperations.GetNodeMetadataAsync(client, request.NodeUid, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return exception;
        }

        if (!metadata.Node.Name.TryGetValue(out var freshName)
            || (request.CurrentName.Length > 0 && freshName != request.CurrentName)
            || metadata.Node.ParentUid != request.CurrentParentUid)
        {
            return new NodeOutOfSyncException(request.NodeUid, response);
        }

        var retryRequest = apiRequest with { CurrentNameDigest = metadata.NameHashDigest };

        return new PreparedNodeMoveItem(request, retryRequest, isSignedAnonymously, CurrentNameDigestIsLocallyComputed: false);
    }

    internal readonly record struct PreparedNodeMoveItem(
        NodeMoveItem Request,
        MoveMultipleLinksItem ApiRequest,
        bool NodeIsSignedAnonymously,
        bool CurrentNameDigestIsLocallyComputed);

    private sealed class MoveBatch(int capacity)
    {
        private readonly Dictionary<LinkId, PreparedNodeMoveItem> _items = new(capacity);
        private readonly List<PreparedNodeMoveItem> _itemsForNextBatch = new(capacity);
        private bool? _isForAnonymouslySignedNodes;

        public IReadOnlyDictionary<LinkId, PreparedNodeMoveItem> Items => _items;

        public bool? IsForAnonymouslySignedNodes => _isForAnonymouslySignedNodes;

        public bool TryAddToCurrentBatch(PreparedNodeMoveItem item)
        {
            var linkId = item.Request.NodeUid.LinkId;

            if (_items.Count >= MaximumBatchSize)
            {
                return false;
            }

            if (_isForAnonymouslySignedNodes is { } batchIsForAnonymouslySignedNodes && batchIsForAnonymouslySignedNodes != item.NodeIsSignedAnonymously)
            {
                return false;
            }

            if (!_items.TryAdd(linkId, item))
            {
                return false;
            }

            _isForAnonymouslySignedNodes ??= item.NodeIsSignedAnonymously;
            return true;
        }

        public bool Remove(LinkId linkId, [NotNullWhen(true)] out PreparedNodeMoveItem? item)
        {
            if (!_items.Remove(linkId, out var removedItem))
            {
                item = null;
                return false;
            }

            item = removedItem;
            return true;
        }

        public void QueueForNextBatch(PreparedNodeMoveItem item)
        {
            _itemsForNextBatch.Add(item);
        }

        public void StartNextBatch()
        {
            _items.Clear();
            _isForAnonymouslySignedNodes = null;

            foreach (var itemForNextBatch in _itemsForNextBatch)
            {
                _items.Add(itemForNextBatch.Request.NodeUid.LinkId, itemForNextBatch);
                _isForAnonymouslySignedNodes ??= itemForNextBatch.NodeIsSignedAnonymously;
            }

            _itemsForNextBatch.Clear();
        }
    }
}
