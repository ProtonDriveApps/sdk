using System.Runtime.CompilerServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class PhotoOperations
{
    private const int ActiveLinkState = 1;

    private const int FavoritePayloadBatchSize = 20;

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

        var operationData = await FolderOperations.GetOperationDataAsync(client, photosRoot.Uid, knownShareAndKey: null, cancellationToken)
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
        FavoriteTarget target = default;
        Exception? resolutionError = null;
        try
        {
            target = await ResolveFavoriteTargetAsync(client, cancellationToken).ConfigureAwait(false);
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

    private static async ValueTask<FavoriteTarget> ResolveFavoriteTargetAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var timelineRoot = await PhotosNodeOperations.GetOrCreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);

        // Target key is borrowed (do not dispose); the signing key is owned by the caller.
        var (targetKey, targetHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(client, timelineRoot.Uid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, timelineRoot.Uid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        return new FavoriteTarget(timelineRoot.Uid, targetKey, targetHashKey, signingKey, membershipAddress.EmailAddress);
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

    /// <summary>An update ready to apply: null <see cref="FavoriteRequest"/> = non-favorite or bodyless favorite; non-null <see cref="Error"/> = favorite preparation failed.</summary>
    private readonly record struct FavoritePreparation(PhotoTagsUpdate Update, FavoritePhotoRequest? FavoriteRequest, Exception? Error);

    /// <summary>The timeline root and keys favorited photos are re-encrypted for; <see cref="SigningKey"/> is owned, <see cref="Key"/> borrowed.</summary>
    private readonly record struct FavoriteTarget(
        NodeUid NodeUid,
        PgpPrivateKey Key,
        ReadOnlyMemory<byte> HashKey,
        PgpPrivateKey SigningKey,
        string EmailAddress);
}
