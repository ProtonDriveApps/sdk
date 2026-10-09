using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class PhotoOperations
{
    private const int ActiveLinkState = 1;

    private const int FavoritePayloadBatchSize = 20;

    // How many photos are loaded and re-encrypted at once, before being split into same/cross-volume API batches.
    private const int PhotoTransferLoadBatchSize = 20;

    // The transfer-multiple and add-multiple endpoints cap how many links (main + related photos) a single request may carry.
    private const int MaxLinksPerTransferBatch = 10;

    // The remove-multiple endpoint takes a list of links; JS sends 10 at a time.
    private const int MaxPhotosPerRemoveBatch = 10;

    /// <summary>Sends one batch of same-volume payloads to the target-specific API endpoint and maps the outcomes.</summary>
    private delegate ValueTask<IReadOnlyList<NodeActionResult>> SameVolumeBatchHandler(
        ProtonDriveClient client,
        NodeUid targetNodeUid,
        IReadOnlyList<TransferEncryptedPhotoPayload> payloads,
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        ISet<NodeUid> retriedPhotoUids,
        CancellationToken cancellationToken);

    public static async ValueTask<AlbumNode> CreateAlbumAsync(ProtonDriveClient client, string name, CancellationToken cancellationToken)
    {
        if (NodeOperations.ValidateName(name) is { } validationException)
        {
            throw validationException;
        }

        var rootFolder = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);
        var (parentKey, parentHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(client, rootFolder.Uid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, rootFolder.Uid, cancellationToken).ConfigureAwait(false);
        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var hashKey = CryptoGenerator.GenerateFolderHashKey();

        NodeOperations.GetCommonCreationParameters(
            name,
            parentKey,
            parentHashKey.Span,
            signingKey,
            PgpProfile.Proton,
            out var key,
            out var lockedKey,
            out var nameSessionKey,
            out var passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var passphraseSignature);

        var request = new CreateAlbumRequest
        {
            Locked = false,
            Link = new AlbumLinkCreationRequest
            {
                Name = encryptedName,
                NameHashDigest = nameHashDigest,
                Key = lockedKey,
                Passphrase = encryptedKeyPassphrase,
                PassphraseSignature = passphraseSignature,
                SignatureEmailAddress = membershipAddress.EmailAddress,
                HashKey = key.EncryptAndSign(hashKey, key),
            },
        };

        var response = await client.Api.Photos.CreateAlbumAsync(rootFolder.Uid.VolumeId, request, cancellationToken).ConfigureAwait(false);

        var albumUid = new NodeUid(rootFolder.Uid.VolumeId, response.Album.Link.LinkId);

        var operationData = new FolderOperationData
        {
            ParentUid = rootFolder.Uid,
            Key = key,
            PassphraseSessionKey = passphraseSessionKey,
            NameSessionKey = nameSessionKey,
            HashKey = hashKey,
        };

        await client.Cache.SetNodeOperationDataAsync(albumUid, operationData, cancellationToken).ConfigureAwait(false);

        var author = new Author { EmailAddress = membershipAddress.EmailAddress };

        var isOnOwnVolume = await VolumeOperations.IsOwnVolumeAsync(client, albumUid.VolumeId, cancellationToken).ConfigureAwait(false);

        return new AlbumNode(new FolderNode
        {
            Uid = albumUid,
            ParentUid = rootFolder.Uid,
            Name = name,
            NameAuthor = author,
            KeyAuthor = author,
            CreationTime = DateTime.UtcNow,
            OwnedBy = rootFolder.OwnedBy,
            IsShared = false,
            IsSharedByUrl = false,
            DirectRole = isOnOwnVolume ? MemberRole.Admin : MemberRole.Inherited,
            Errors = [],
        })
        {
            PhotoCount = 0,
            CoverPhotoUid = null,
            LastActivityTime = null,
        };
    }

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

        await foreach (var result in TransferPhotosToTargetAsync(client, target, photoUids, TransferSameVolumeBatchAsync, cancellationToken)
            .ConfigureAwait(false))
        {
            yield return result;
        }
    }

    /// <summary>
    /// Adds each photo to the given album: same-volume photos are added via <c>add-multiple</c>,
    /// cross-volume photos (e.g. from a shared-with-me album or another user's timeline) are copied via the generic copy endpoint.
    /// Mirrors the JS <c>AddToAlbumProcess</c>, including the single retry when the server reports missing related photos.
    /// </summary>
    public static async IAsyncEnumerable<NodeActionResult> AddPhotosToAlbumAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        IReadOnlyList<NodeUid> photoUids,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (photoUids.Count == 0)
        {
            yield break;
        }

        var target = await ResolveTargetAsync(client, albumUid, cancellationToken).ConfigureAwait(false);

        await foreach (var result in TransferPhotosToTargetAsync(client, target, photoUids, AddToAlbumSameVolumeBatchAsync, cancellationToken)
            .ConfigureAwait(false))
        {
            yield return result;
        }
    }

    /// <summary>
    /// Removes photos from an album without deleting them, yielding one result per photo. A failed request fails every
    /// photo it carried, as the API reports a single outcome per request. Mirrors the JS <c>removePhotosFromAlbum</c>.
    /// </summary>
    public static IAsyncEnumerable<NodeActionResult> RemovePhotosFromAlbumAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        IReadOnlyList<NodeUid> photoUids,
        CancellationToken cancellationToken)
    {
        return RemovePhotosFromAlbumInBatchesAsync(client, albumUid, photoUids, MaxPhotosPerRemoveBatch, cancellationToken);
    }

    /// <summary>
    /// Renames an album and/or sets its cover photo, returning the album as the server now reports it.
    /// With neither a name nor a cover, nothing is sent and the album is returned as it is.
    /// </summary>
    public static async ValueTask<AlbumNode> UpdateAlbumAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        string? name,
        NodeUid? coverPhotoUid,
        CancellationToken cancellationToken)
    {
        if (name is not null && NodeOperations.ValidateName(name) is { } validationException)
        {
            throw validationException;
        }

        if (coverPhotoUid is { } cover && cover.VolumeId != albumUid.VolumeId)
        {
            throw new ValidationException("The cover photo must be in the same volume as the album");
        }

        var metadata = await NodeOperations.GetNodeMetadataAsync(client, albumUid, cancellationToken).ConfigureAwait(false);

        if (metadata.Node is not AlbumNode album)
        {
            throw new InvalidOperationException($"Node {albumUid} is not an album.");
        }

        if (name is null && coverPhotoUid is null)
        {
            return album;
        }

        AlbumLinkUpdate? linkUpdate = null;

        if (name is not null)
        {
            var parentUid = album.ParentUid ?? throw new InvalidOperationException($"Parent not available for {albumUid}");

            var nameSessionKey = metadata.OperationData.NameSessionKey
                ?? throw new InvalidOperationException($"Name session key not available for {albumUid}");

            var (parentKey, parentHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

            var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, parentUid, cancellationToken).ConfigureAwait(false);
            var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

            NodeOperations.GetNameParameters(name, parentKey, parentHashKey.Span, nameSessionKey, signingKey, out var encryptedName, out var nameHashDigest);

            linkUpdate = new AlbumLinkUpdate
            {
                Name = encryptedName,
                NameHashDigest = nameHashDigest,
                OriginalNameHashDigest = metadata.NameHashDigest,
                NameSignatureEmailAddress = membershipAddress.EmailAddress,
            };
        }

        var request = new UpdateAlbumRequest { CoverLinkId = coverPhotoUid?.LinkId, Link = linkUpdate };

        await client.Api.Photos.UpdateAlbumAsync(albumUid.VolumeId, albumUid.LinkId, request, cancellationToken).ConfigureAwait(false);

        var updatedNode = await NodeOperations.TryGetNodeAsync(client, albumUid, cancellationToken).ConfigureAwait(false);

        return updatedNode as AlbumNode ?? throw new NodeNotFoundException(albumUid);
    }

    /// <summary>
    /// Permanently deletes an album. Photos already in the timeline are unaffected; if the album also has photos
    /// that exist only in it, the delete fails unless <paramref name="force"/> (permanently delete them too) or
    /// <paramref name="saveToTimeline"/> (move them to the timeline first, then delete) is set.
    /// </summary>
    public static ValueTask DeleteAlbumAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        bool force,
        bool saveToTimeline,
        CancellationToken cancellationToken)
    {
        return DeleteAlbumCoreAsync(client, albumUid, force, saveToTimeline, SavePhotosToTimelineAsync, cancellationToken);
    }

    internal static async IAsyncEnumerable<NodeActionResult> RemovePhotosFromAlbumInBatchesAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        IReadOnlyList<NodeUid> photoUids,
        int batchSize,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var sameVolumePhotoUids = new List<NodeUid>(photoUids.Count);

        foreach (var photoUid in photoUids)
        {
            if (photoUid.VolumeId != albumUid.VolumeId)
            {
                yield return new NodeActionResult(photoUid, new ValidationException("The photo must be in the same volume as the album"));
                continue;
            }

            sameVolumePhotoUids.Add(photoUid);
        }

        foreach (var batch in sameVolumePhotoUids.Chunk(batchSize))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var request = new MultipleLinksNullaryRequest { LinkIds = batch.Select(photoUid => photoUid.LinkId).ToList() };

            Exception? error = null;

            try
            {
                await client.Api.Photos.RemovePhotosFromAlbumAsync(albumUid.VolumeId, albumUid.LinkId, request, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                error = exception;
            }

            foreach (var photoUid in batch)
            {
                yield return new NodeActionResult(photoUid, error is null ? Result<Exception>.Success : error);
            }
        }
    }

    internal static async ValueTask DeleteAlbumCoreAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        bool force,
        bool saveToTimeline,
        Func<ProtonDriveClient, IReadOnlyList<NodeUid>, CancellationToken, IAsyncEnumerable<NodeActionResult>> savePhotosToTimeline,
        CancellationToken cancellationToken)
    {
        try
        {
            await DeleteAlbumAndMapErrorsAsync(client, albumUid, force, cancellationToken).ConfigureAwait(false);
        }
        catch (AlbumContainsPhotosNotInTimelineException exception) when (saveToTimeline && exception.PhotosOnlyInAlbumNodeUids.Count > 0)
        {
            await foreach (var result in savePhotosToTimeline(client, exception.PhotosOnlyInAlbumNodeUids, cancellationToken).ConfigureAwait(false))
            {
                if (result.Result.TryGetError(out var error))
                {
                    // The error was thrown and caught deeper down; rethrowing it directly would overwrite its original stack trace.
                    ExceptionDispatchInfo.Capture(error).Throw();
                }
            }

            // The retry goes through the same mapping, so a photo added meanwhile is still reported as the domain exception.
            await DeleteAlbumAndMapErrorsAsync(client, albumUid, force, cancellationToken).ConfigureAwait(false);
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

    /// <summary>Builds the <c>add-multiple</c> request from the given payloads (main + related, flattened) and maps the outcomes.</summary>
    internal static async ValueTask<IReadOnlyList<NodeActionResult>> AddToAlbumSameVolumeBatchAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        IReadOnlyList<TransferEncryptedPhotoPayload> payloads,
        Queue<PhotoTransferPayloadBuilder.PhotoPayloadItem> queue,
        ISet<NodeUid> retriedPhotoUids,
        CancellationToken cancellationToken)
    {
        var volumeId = albumUid.VolumeId;

        var albumData = payloads
            .SelectMany(payload => payload.RelatedPhotos.Prepend(payload))
            .Select(ToAlbumPhotoLinkItem)
            .ToList();

        var request = new AddPhotosToAlbumRequest { AlbumData = albumData };

        var response = await client.Api.Photos.AddPhotosToAlbumAsync(volumeId, albumUid.LinkId, request, cancellationToken).ConfigureAwait(false);

        return RecordTransferOutcomes(volumeId, payloads, response.Responses, queue, retriedPhotoUids);
    }

    internal static async ValueTask<IReadOnlyList<NodeActionResult>> TransferSameVolumeBatchAsync(
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

    /// <summary>
    /// Drives a photo transfer to <paramref name="target"/>: same-volume photos go through
    /// <paramref name="sameVolumeBatchAsync"/>, cross-volume photos are copied via the generic copy endpoint.
    /// Shared by <see cref="SavePhotosToTimelineAsync"/> and <see cref="AddPhotosToAlbumAsync"/>, which differ only in
    /// the resolved target and which same-volume API call is made. Retries once per photo when the server reports
    /// missing related photos.
    /// </summary>
    private static async IAsyncEnumerable<NodeActionResult> TransferPhotosToTargetAsync(
        ProtonDriveClient client,
        PhotoTransferTarget target,
        IReadOnlyList<NodeUid> photoUids,
        SameVolumeBatchHandler sameVolumeBatchAsync,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
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

                var batch = DequeueBatch(queue, PhotoTransferLoadBatchSize);

                var (payloads, errors) = await PhotoTransferPayloadBuilder.BuildPayloadsAsync(
                    client,
                    batch,
                    target.NodeUid,
                    target.Key,
                    target.HashKey,
                    target.SigningKey,
                    target.EmailAddress,
                    cancellationToken).ConfigureAwait(false);

                // Build errors (including "already in the target") are reported per node, not silently skipped.
                foreach (var (nodeUid, error) in errors)
                {
                    yield return new NodeActionResult(nodeUid, error);
                }

                var sameVolumePayloads = payloads.Where(payload => payload.NodeUid.VolumeId == target.NodeUid.VolumeId).ToList();
                var crossVolumePayloads = payloads.Where(payload => payload.NodeUid.VolumeId != target.NodeUid.VolumeId).ToList();

                // Results stream out as each batch resolves, so successes from earlier batches survive a later transport failure.
                foreach (var transferBatch in CreateBatches(sameVolumePayloads, MaxLinksPerTransferBatch))
                {
                    var outcomes = await sameVolumeBatchAsync(client, target.NodeUid, transferBatch, queue, retriedPhotoUids, cancellationToken)
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
        PhotoTransferTarget target = default;
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

    private static async ValueTask<PhotoTransferTarget> ResolveTimelineTargetAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var timelineRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);

        return await ResolveTargetAsync(client, timelineRoot.Uid, cancellationToken).ConfigureAwait(false);
    }

    private static async ValueTask<PhotoTransferTarget> ResolveTargetAsync(ProtonDriveClient client, NodeUid targetNodeUid, CancellationToken cancellationToken)
    {
        // Target key is borrowed (do not dispose); the signing key is owned by the caller.
        var (targetKey, targetHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(client, targetNodeUid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, targetNodeUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        return new PhotoTransferTarget(targetNodeUid, targetKey, targetHashKey, signingKey, membershipAddress.EmailAddress);
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

    private static async ValueTask DeleteAlbumAndMapErrorsAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        bool force,
        CancellationToken cancellationToken)
    {
        try
        {
            await client.Api.Photos.DeleteAlbumAsync(albumUid.VolumeId, albumUid.LinkId, force, cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException<DeleteAlbumFailureResponse> exception)
            when (exception.Response is { Code: DriveApiResponseCodes.AlbumContainsPhotosNotInTimeline } response)
        {
            var photoUids = (response.Details?.ChildLinkIDs ?? []).Select(linkId => new NodeUid(albumUid.VolumeId, linkId)).ToList();

            throw new AlbumContainsPhotosNotInTimelineException(photoUids, response);
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

    private static AlbumPhotoLinkItem ToAlbumPhotoLinkItem(TransferEncryptedPhotoPayload payload)
    {
        return new AlbumPhotoLinkItem
        {
            LinkId = payload.NodeUid.LinkId,
            NameHashDigest = payload.NameHashDigest,
            Name = payload.Name,
            NameSignatureEmailAddress = payload.NameSignatureEmailAddress,
            Passphrase = payload.Passphrase,
            ContentHash = payload.ContentHash,

            // add-multiple rejects these fields entirely, even for anonymous nodes (unlike move/copy).
            PassphraseSignature = null,
            SignatureEmailAddress = null,
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

    /// <summary>The target node (timeline root or album) and keys photos are re-encrypted for; <see cref="SigningKey"/> is owned, <see cref="Key"/> borrowed.</summary>
    private readonly record struct PhotoTransferTarget(
        NodeUid NodeUid,
        PgpPrivateKey Key,
        ReadOnlyMemory<byte> HashKey,
        PgpPrivateKey SigningKey,
        string EmailAddress);
}
