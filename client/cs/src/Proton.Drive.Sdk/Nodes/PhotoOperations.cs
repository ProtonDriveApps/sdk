using System.Runtime.CompilerServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class PhotoOperations
{
    private const int ActiveLinkState = 1;

    private const int FavoritePayloadBatchSize = 20;

    private const int SaveToTimelineBatchSize = 20;

    // The transfer-multiple endpoint caps how many links (main + related photos) a single request may carry.
    private const int MaxLinksPerTransferBatch = 10;

    public static async IAsyncEnumerable<NodeUid> EnumerateSharedWithMeAlbumUidsAsync(
        ProtonDriveClient client,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var anchorId = default(LinkId?);
        var mustTryMoreResults = true;

        while (mustTryMoreResults)
        {
            var response = await client.Api.Photos.GetSharedAlbumsAsync(anchorId, cancellationToken).ConfigureAwait(false);

            foreach (var album in response.Albums)
            {
                yield return new NodeUid(album.VolumeId, album.LinkId);
            }

            anchorId = response.AnchorId;
            mustTryMoreResults = response.More && anchorId is not null;
        }
    }

    public static async ValueTask<IReadOnlyList<string>> FindDuplicatesAsync(
        ProtonDriveClient client,
        string name,
        Func<CancellationToken, ValueTask<ReadOnlyMemory<byte>>> computeContentSha1,
        CancellationToken cancellationToken)
    {
        var photosRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);

        var operationData = await FolderOperations.GetOperationDataAsync(client, photosRoot.Uid, cancellationToken)
            .ConfigureAwait(false);

        var hashKey = operationData.HashKey ?? throw new InvalidOperationException("Photos root hash key not available");

        var nameHash = NodeCrypto.HashNodeName(name, hashKey.Span);

        var response = await client.Api.Photos.FindDuplicatesAsync(photosRoot.Uid.VolumeId, [nameHash], cancellationToken).ConfigureAwait(false);

        var candidates = SelectActiveCandidates(response.DuplicateHashes);

        if (candidates.Count == 0)
        {
            return [];
        }

        // Only compute the (potentially expensive) content hash once we know a name already matches.
        var contentSha1Digest = await computeContentSha1(cancellationToken).ConfigureAwait(false);
        var contentHash = NodeCrypto.HashContentDigest(contentSha1Digest, hashKey.Span);

        return MatchDuplicates(candidates, photosRoot.Uid.VolumeId, nameHash, contentHash);
    }

    public static async IAsyncEnumerable<PhotoUpdateResult> UpdatePhotosAsync(
        ProtonDriveClient client,
        IReadOnlyList<PhotoTagsUpdate> updates,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await foreach (var preparation in EnumerateNodeUidsWithFavoritePayloadsAsync(client, updates, cancellationToken).ConfigureAwait(false))
        {
            var update = preparation.Update;

            if (preparation.Error is { } error)
            {
                yield return new PhotoUpdateResult(update.NodeUid, error);
                continue;
            }

            Result<Exception> result;
            try
            {
                await ApplyTagUpdateAsync(client, update, preparation.FavoriteRequest, cancellationToken).ConfigureAwait(false);

                result = Result<Exception>.Success;
            }
            catch (Exception exception)
            {
                result = exception;
            }

            yield return new PhotoUpdateResult(update.NodeUid, result);
        }
    }

    /// <summary>
    /// Copies each photo into the user's own timeline: same-volume photos are moved via <c>transfer-multiple</c>,
    /// cross-volume photos (e.g. from shared-with-me albums) are copied via the generic copy endpoint.
    /// Mirrors the JS <c>saveToTimeline</c>, including the single retry when the server reports missing related photos.
    /// </summary>
    public static async IAsyncEnumerable<NodeActionResult> SavePhotosToTimelineAsync(
        ProtonDriveClient client,
        IReadOnlyList<NodeUid> photoUids,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (photoUids.Count == 0)
        {
            yield break;
        }

        var target = await ResolveTimelineTargetAsync(client, cancellationToken).ConfigureAwait(false);

        // Signing key is owned and disposed here; the target key is borrowed and must not be disposed.
        using (target.SigningKey)
        {
            // A photo that comes back needing related photos is re-queued once with the reported UIDs.
            var queue = new Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem>(
                photoUids.Select(uid => new PhotoTransferPayloadBuilder.PhotoPayloadItem(uid, [])));
            var retriedPhotoUids = new HashSet<NodeUid>();

            while (queue.Count > 0)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var batch = DequeueBatch(queue, SaveToTimelineBatchSize);

                var (payloads, errors) = await PhotoTransferPayloadBuilder.BuildPayloadsAsync(
                    client,
                    batch,
                    target.NodeUid,
                    target.Key,
                    target.HashKey,
                    target.SigningKey,
                    target.EmailAddress,
                    cancellationToken).ConfigureAwait(false);

                // Build errors (including "already in the timeline") are reported per node; unlike favoriting, they are not silently skipped.
                foreach (var (nodeUid, error) in errors)
                {
                    yield return new NodeActionResult(nodeUid, error);
                }

                var sameVolumePayloads = payloads.Where(payload => payload.NodeUid.VolumeId == target.NodeUid.VolumeId).ToList();
                var crossVolumePayloads = payloads.Where(payload => payload.NodeUid.VolumeId != target.NodeUid.VolumeId).ToList();

                // Results stream out as each batch resolves, so successes from earlier batches survive a later transport failure.
                foreach (var transferBatch in CreateBatches(sameVolumePayloads, MaxLinksPerTransferBatch))
                {
                    var outcomes = await TransferSameVolumeBatchAsync(client, target.NodeUid, transferBatch, queue, retriedPhotoUids, cancellationToken)
                        .ConfigureAwait(false);

                    foreach (var outcome in outcomes)
                    {
                        yield return outcome;
                    }
                }

                foreach (var payload in crossVolumePayloads)
                {
                    var outcome = await CopyCrossVolumePhotoAsync(client, target.NodeUid, payload, queue, retriedPhotoUids, cancellationToken)
                        .ConfigureAwait(false);

                    // A photo re-queued for missing related photos has no terminal outcome yet.
                    if (outcome is { } resolved)
                    {
                        yield return resolved;
                    }
                }
            }
        }
    }

    /// <summary>
    /// Groups payloads so no <c>transfer-multiple</c> request exceeds <paramref name="maxLinksPerBatch"/> links,
    /// counting each payload's main photo plus its related photos. Mirrors the JS <c>createBatches</c>.
    /// </summary>
    internal static IEnumerable<IReadOnlyList<TransferEncryptedPhotoPayload>> CreateBatches(
        IReadOnlyList<TransferEncryptedPhotoPayload> payloads,
        int maxLinksPerBatch)
    {
        var currentBatch = new List<TransferEncryptedPhotoPayload>();
        var currentLinkCount = 0;

        foreach (var payload in payloads)
        {
            var linkCount = 1 + payload.RelatedPhotos.Count;

            // Never emit an empty batch, so a single over-sized payload still goes out on its own.
            if (currentBatch.Count > 0 && currentLinkCount + linkCount > maxLinksPerBatch)
            {
                yield return currentBatch;
                currentBatch = [];
                currentLinkCount = 0;
            }

            currentBatch.Add(payload);
            currentLinkCount += linkCount;
        }

        if (currentBatch.Count > 0)
        {
            yield return currentBatch;
        }
    }

    /// <summary>Maps <c>transfer-multiple</c> per-link outcomes to results, mirroring the JS handling in <c>transferPhotos</c>.</summary>
    internal static IReadOnlyList<NodeActionResult> RecordTransferOutcomes(
        VolumeId volumeId,
        IReadOnlyList<TransferEncryptedPhotoPayload> payloads,
        IReadOnlyList<TransferPhotoResponsePair> responses,
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        ISet<NodeUid> retriedPhotoUids)
    {
        var errorsByUid = new Dictionary<NodeUid, Exception>();

        foreach (var pair in responses)
        {
            if (pair.Response.IsSuccess)
            {
                continue;
            }

            var nodeUid = new NodeUid(volumeId, pair.LinkId);

            errorsByUid[nodeUid] = pair.Response.Details?.Missing is { Count: > 0 } missing
                ? new MissingRelatedPhotosException(missing.Select(linkId => new NodeUid(volumeId, linkId)).ToList())
                : new ProtonApiException(pair.Response);
        }

        var outcomes = new List<NodeActionResult>(payloads.Count);

        // Report only the main photos, mirroring JS transferPhotos: the response keys errors by link ID and
        // only main payloads are enumerated, so a related photo's own failure is not reported (the
        // missing-related case is keyed on the main link) and a main photo without a response entry counts as success.
        foreach (var nodeUid in payloads.Select(payload => payload.NodeUid))
        {
            if (RecordOutcome(nodeUid, errorsByUid.GetValueOrDefault(nodeUid), queue, retriedPhotoUids) is { } outcome)
            {
                outcomes.Add(outcome);
            }
        }

        return outcomes;
    }

    internal static IReadOnlyList<FoundDuplicateDto> SelectActiveCandidates(IReadOnlyList<FoundDuplicateDto> duplicates)
    {
        return duplicates
            .Where(duplicate =>
                duplicate.LinkId is not null
                && duplicate is { LinkState: ActiveLinkState, Hash.IsEmpty: false, ContentHash.IsEmpty: false })
            .ToList();
    }

    internal static IReadOnlyList<string> MatchDuplicates(
        IReadOnlyList<FoundDuplicateDto> candidates,
        VolumeId volumeId,
        ReadOnlyMemory<byte> nameHash,
        ReadOnlyMemory<byte> contentHash)
    {
        return candidates
            .Where(duplicate => duplicate.Hash.Span.SequenceEqual(nameHash.Span) && duplicate.ContentHash.Span.SequenceEqual(contentHash.Span))
            .Select(duplicate => new NodeUid(volumeId, duplicate.LinkId!.Value).ToString())
            .ToList();
    }

    /// <summary>
    /// Yields one preparation per update, non-favorites pass through;
    /// favorites carry a payload re-encrypted for the timeline root (or none when already there),
    /// with per-photo failures reported rather than thrown.
    /// Mirrors the JS <c>iterateNodeUidsWithFavoritePayloads</c>.
    /// </summary>
    private static async IAsyncEnumerable<FavoritePreparation> EnumerateNodeUidsWithFavoritePayloadsAsync(
        ProtonDriveClient client,
        IReadOnlyList<PhotoTagsUpdate> updates,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        // Non-favorite updates don't need the timeline root, so pass them through first.
        foreach (var update in updates.Where(update => !update.TagsToAdd.Contains(PhotoTag.Favorite)))
        {
            yield return new FavoritePreparation(update, FavoriteRequest: null, Error: null);
        }

        var favoriteUpdates = updates.Where(update => update.TagsToAdd.Contains(PhotoTag.Favorite)).ToList();
        if (favoriteUpdates.Count == 0)
        {
            yield break;
        }

        // Favoriting re-encrypts each photo for the user's timeline root; resolve that target and its keys once.
        TimelineTarget target = default;
        Exception? resolutionError = null;
        try
        {
            target = await ResolveTimelineTargetAsync(client, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            resolutionError = exception;
        }

        if (resolutionError is not null)
        {
            foreach (var update in favoriteUpdates)
            {
                yield return new FavoritePreparation(update, FavoriteRequest: null, resolutionError);
            }

            yield break;
        }

        // Signing key is owned and disposed here; the target key is borrowed and must not be disposed.
        using (target.SigningKey)
        {
            // Batch favorites so payloads stream through rather than all being built up front.
            foreach (var batch in favoriteUpdates.Chunk(FavoritePayloadBatchSize))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var (payloads, errors) = await PhotoTransferPayloadBuilder.BuildPayloadsAsync(
                    client,
                    batch.Select(update => new PhotoTransferPayloadBuilder.PhotoPayloadItem(update.NodeUid, [])).ToList(),
                    target.NodeUid,
                    target.Key,
                    target.HashKey,
                    target.SigningKey,
                    target.EmailAddress,
                    cancellationToken).ConfigureAwait(false);

                var requestsByUid = payloads.ToDictionary(
                    payload => payload.NodeUid,
                    payload => new FavoritePhotoRequest { PhotoData = ToFavoritePhotoData(payload) });

                foreach (var update in batch)
                {
                    // A build error other than "already in the timeline root" fails just that favorite.
                    if (errors.TryGetValue(update.NodeUid, out var buildError) && buildError is not PhotoAlreadyInTargetException)
                    {
                        yield return new FavoritePreparation(update, FavoriteRequest: null, buildError);
                        continue;
                    }

                    // Already in the timeline root → no payload, bodyless favorite.
                    requestsByUid.TryGetValue(update.NodeUid, out var favoriteRequest);

                    yield return new FavoritePreparation(update, favoriteRequest, Error: null);
                }
            }
        }
    }

    private static async ValueTask ApplyTagUpdateAsync(
        ProtonDriveClient client,
        PhotoTagsUpdate update,
        FavoritePhotoRequest? favoriteRequest,
        CancellationToken cancellationToken)
    {
        var volumeId = update.NodeUid.VolumeId;
        var linkId = update.NodeUid.LinkId;

        if (update.TagsToAdd.Contains(PhotoTag.Favorite))
        {
            // No payload (already in the timeline root) → bodyless favorite.
            if (favoriteRequest is { } request)
            {
                await client.Api.Photos.SetPhotoFavoriteAsync(volumeId, linkId, request, cancellationToken).ConfigureAwait(false);
            }
            else
            {
                await client.Api.Photos.SetPhotoFavoriteAsync(volumeId, linkId, cancellationToken).ConfigureAwait(false);
            }
        }

        var tagsToAdd = update.TagsToAdd.Where(tag => tag != PhotoTag.Favorite).Select(tag => (int)tag).ToList();
        if (tagsToAdd.Count > 0)
        {
            await client.Api.Photos.AddPhotoTagsAsync(volumeId, linkId, tagsToAdd, cancellationToken).ConfigureAwait(false);
        }

        if (update.TagsToRemove.Count > 0)
        {
            var tagsToRemove = update.TagsToRemove.Select(tag => (int)tag).ToList();
            await client.Api.Photos.RemovePhotoTagsAsync(volumeId, linkId, tagsToRemove, cancellationToken).ConfigureAwait(false);
        }
    }

    private static async ValueTask<TimelineTarget> ResolveTimelineTargetAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var timelineRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);

        // Target key is borrowed (do not dispose); the signing key is owned by the caller.
        var (targetKey, targetHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(client, timelineRoot.Uid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, timelineRoot.Uid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        return new TimelineTarget(timelineRoot.Uid, targetKey, targetHashKey, signingKey, membershipAddress.EmailAddress);
    }

    private static FavoritePhotoData ToFavoritePhotoData(TransferEncryptedPhotoPayload payload)
    {
        return new FavoritePhotoData
        {
            NameHashDigest = payload.NameHashDigest,
            Name = payload.Name,
            NameSignatureEmailAddress = payload.NameSignatureEmailAddress,
            Passphrase = payload.Passphrase,
            ContentHash = payload.ContentHash,
            PassphraseSignature = payload.PassphraseSignature,
            SignatureEmailAddress = payload.SignatureEmailAddress,
            RelatedPhotos = payload.RelatedPhotos.Select(ToFavoriteRelatedPhotoItem).ToList(),
        };
    }

    private static FavoriteRelatedPhotoItem ToFavoriteRelatedPhotoItem(TransferEncryptedPhotoPayload payload)
    {
        return new FavoriteRelatedPhotoItem
        {
            LinkId = payload.NodeUid.LinkId,
            NameHashDigest = payload.NameHashDigest,
            Name = payload.Name,
            NameSignatureEmailAddress = payload.NameSignatureEmailAddress,
            Passphrase = payload.Passphrase,
            ContentHash = payload.ContentHash,
            PassphraseSignature = payload.PassphraseSignature,
            SignatureEmailAddress = payload.SignatureEmailAddress,
        };
    }

    private static List<PhotoTransferPayloadBuilder.PhotoPayloadItem> DequeueBatch(
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        int size)
    {
        var batch = new List<PhotoTransferPayloadBuilder.PhotoPayloadItem>(Math.Min(size, queue.Count));

        while (batch.Count < size && queue.TryDequeue(out var item))
        {
            batch.Add(item);
        }

        return batch;
    }

    private static async ValueTask<IReadOnlyList<NodeActionResult>> TransferSameVolumeBatchAsync(
        ProtonDriveClient client,
        NodeUid targetNodeUid,
        IReadOnlyList<TransferEncryptedPhotoPayload> payloads,
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        ISet<NodeUid> retriedPhotoUids,
        CancellationToken cancellationToken)
    {
        var volumeId = targetNodeUid.VolumeId;

        // Every payload is signed by the timeline membership address, so the name signature email is uniform.
        var nameSignatureEmail = payloads[0].NameSignatureEmailAddress;
        if (payloads.Any(payload => payload.NameSignatureEmailAddress != nameSignatureEmail))
        {
            throw new InvalidOperationException("All photos must share the same name signature email");
        }

        var links = payloads
            .SelectMany(payload => payload.RelatedPhotos.Prepend(payload))
            .Select(ToTransferPhotoLinkItem)
            .ToList();

        var request = new TransferPhotosRequest
        {
            ParentLinkId = targetNodeUid.LinkId,
            Links = links,
            NameSignatureEmailAddress = nameSignatureEmail,

            // Required by the API only when moving an anonymous node.
            SignatureEmailAddress = null,
        };

        var response = await client.Api.Photos.TransferPhotosAsync(volumeId, request, cancellationToken).ConfigureAwait(false);

        return RecordTransferOutcomes(volumeId, payloads, response.Responses, queue, retriedPhotoUids);
    }

    private static async ValueTask<NodeActionResult?> CopyCrossVolumePhotoAsync(
        ProtonDriveClient client,
        NodeUid targetNodeUid,
        TransferEncryptedPhotoPayload payload,
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        ISet<NodeUid> retriedPhotoUids,
        CancellationToken cancellationToken)
    {
        var sourceVolumeId = payload.NodeUid.VolumeId;

        var request = new CopyPhotoRequest
        {
            TargetVolumeId = targetNodeUid.VolumeId,
            TargetParentLinkId = targetNodeUid.LinkId,
            NameHashDigest = payload.NameHashDigest,
            Name = payload.Name,
            NameSignatureEmailAddress = payload.NameSignatureEmailAddress,
            Passphrase = payload.Passphrase,
            PassphraseSignature = payload.PassphraseSignature,
            SignatureEmailAddress = payload.SignatureEmailAddress,
            Photos = new CopyPhotoContent
            {
                ContentHash = payload.ContentHash,
                RelatedPhotos = payload.RelatedPhotos.Select(ToCopyPhotoRelatedItem).ToList(),
            },
        };

        try
        {
            await client.Api.Photos.CopyPhotoAsync(sourceVolumeId, payload.NodeUid.LinkId, request, cancellationToken).ConfigureAwait(false);

            return RecordOutcome(payload.NodeUid, error: null, queue, retriedPhotoUids);
        }
        catch (ProtonApiException<CopyPhotoFailureResponse> exception) when (exception.Response?.Details?.Missing is { Count: > 0 } missing)
        {
            var missingNodeUids = missing.Select(linkId => new NodeUid(sourceVolumeId, linkId)).ToList();

            return RecordOutcome(payload.NodeUid, new MissingRelatedPhotosException(missingNodeUids), queue, retriedPhotoUids);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return new NodeActionResult(payload.NodeUid, exception);
        }
    }

    private static NodeActionResult? RecordOutcome(
        NodeUid nodeUid,
        Exception? error,
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        ISet<NodeUid> retriedPhotoUids)
    {
        switch (error)
        {
            case null:
                return new NodeActionResult(nodeUid, Result<Exception>.Success);

            // Retry once with the related photos the server asked for; Add returns false once already retried.
            case MissingRelatedPhotosException missing when retriedPhotoUids.Add(nodeUid):
                queue.Enqueue(new PhotoTransferPayloadBuilder.PhotoPayloadItem(nodeUid, missing.MissingNodeUids));
                return null;

            default:
                return new NodeActionResult(nodeUid, error);
        }
    }

    private static TransferPhotoLinkItem ToTransferPhotoLinkItem(TransferEncryptedPhotoPayload payload)
    {
        return new TransferPhotoLinkItem
        {
            LinkId = payload.NodeUid.LinkId,
            NameHashDigest = payload.NameHashDigest,
            OriginalNameHashDigest = payload.OriginalNameHashDigest,
            Name = payload.Name,
            Passphrase = payload.Passphrase,
            ContentHash = payload.ContentHash,

            // The API requires a passphrase signature only for anonymous nodes, which are not moved here.
            PassphraseSignature = null,
        };
    }

    private static CopyPhotoRelatedItem ToCopyPhotoRelatedItem(TransferEncryptedPhotoPayload payload)
    {
        return new CopyPhotoRelatedItem
        {
            LinkId = payload.NodeUid.LinkId,
            NameHashDigest = payload.NameHashDigest,
            Name = payload.Name,
            Passphrase = payload.Passphrase,
            ContentHash = payload.ContentHash,
        };
    }

    /// <summary>An update ready to apply: null <see cref="FavoriteRequest"/> = non-favorite or bodyless favorite; non-null <see cref="Error"/> = favorite preparation failed.</summary>
    private readonly record struct FavoritePreparation(PhotoTagsUpdate Update, FavoritePhotoRequest? FavoriteRequest, Exception? Error);

    /// <summary>The timeline root and keys favorited photos are re-encrypted for; <see cref="SigningKey"/> is owned, <see cref="Key"/> borrowed.</summary>
    private readonly record struct TimelineTarget(
        NodeUid NodeUid,
        PgpPrivateKey Key,
        ReadOnlyMemory<byte> HashKey,
        PgpPrivateKey SigningKey,
        string EmailAddress);
}
