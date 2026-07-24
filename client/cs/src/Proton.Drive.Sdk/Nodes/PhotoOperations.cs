using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class PhotoOperations
{
    private const int ActiveLinkState = 1;

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

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> UpdatePhotosAsync(
        ProtonDriveClient client,
        IReadOnlyList<PhotoTagsUpdate> updates,
        CancellationToken cancellationToken)
    {
        var results = new Dictionary<NodeUid, Result<Exception>>(updates.Count);

        // Favoriting a photo that does not live in the user's own photos volume (i.e. a shared photo)
        // requires re-encrypting the photo and its related photos for the target and sending that payload,
        // which is not yet supported. Resolve the user's photos volume once so we can reject those updates.
        var photosVolumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(client, cancellationToken).ConfigureAwait(false);

        foreach (var update in updates)
        {
            try
            {
                await ApplyTagUpdateAsync(client, update, photosVolumeId, cancellationToken).ConfigureAwait(false);

                results[update.NodeUid] = Result<Exception>.Success;
            }
            catch (Exception exception)
            {
                results[update.NodeUid] = exception;
            }
        }

        return results;
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

    private static async ValueTask ApplyTagUpdateAsync(
        ProtonDriveClient client,
        PhotoTagsUpdate update,
        VolumeId? photosVolumeId,
        CancellationToken cancellationToken)
    {
        var volumeId = update.NodeUid.VolumeId;
        var linkId = update.NodeUid.LinkId;

        if (update.TagsToAdd.Contains(PhotoTag.Favorite))
        {
            // The bodyless favorite request only works for photos already in the user's own timeline. A photo on
            // another volume is a shared photo whose favorite must carry a re-encrypted payload for the photo and its
            // related photos, which is not yet implemented.
            if (photosVolumeId is { } ownVolumeId && volumeId != ownVolumeId)
            {
                throw new NotSupportedException("Favoriting shared photos is not yet supported.");
            }

            await client.Api.Photos.SetPhotoFavoriteAsync(volumeId, linkId, cancellationToken).ConfigureAwait(false);
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
}
