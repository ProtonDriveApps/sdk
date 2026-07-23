using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class PhotosNodeOperations
{
    private const int TimelinePageSize = 500;

    public static async ValueTask<FolderNode> GetOrCreatePhotosFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var existingFolder = await TryGetExistingPhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);

        return existingFolder ?? await CreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<FolderNode?> TryGetExistingPhotosFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        try
        {
            var (volumeDto, shareDto, linkDetailsDto) = await client.Api.Photos.GetRootShareAsync(cancellationToken).ConfigureAwait(false);

            await client.Cache.SetPhotosVolumeIdAsync(volumeDto.Id, cancellationToken).ConfigureAwait(false);

            var nodeUid = new NodeUid(volumeDto.Id, linkDetailsDto.Link.Id);

            var shareAndKey = await ShareCrypto.DecryptShareAsync(
                client,
                shareDto.Id,
                shareDto.Key,
                shareDto.Passphrase,
                shareDto.MembershipAddressId,
                nodeUid,
                ShareType.Photos,
                cancellationToken).ConfigureAwait(false);

            var (share, shareKey) = shareAndKey;

            await client.Cache.SetShareKeyAsync(share.Id, shareKey, cancellationToken).ConfigureAwait(false);

            var conversionResult = await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
                client,
                volumeDto.Id,
                linkDetailsDto,
                shareAndKey,
                cancellationToken).ConfigureAwait(false);

            return conversionResult.Metadata.GetFolderNodeOrThrow();
        }
        catch (ProtonApiException e) when (e.Code is DriveApiResponseCodes.DoesNotExist)
        {
            await client.Cache.SetPhotosVolumeIdAsync(null, cancellationToken).AsTask().ConfigureAwait(false);
            return null;
        }
    }

    public static async IAsyncEnumerable<PhotosTimelineItem> EnumeratePhotosTimelineAsync(
        ProtonDriveClient client,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorLinkId = default(LinkId?);

        do
        {
            var rootFolderNode = await GetOrCreatePhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);

            var photosVolumeId = rootFolderNode.Uid.VolumeId;

            var request = new TimelinePhotoListRequest { VolumeId = photosVolumeId, PreviousPageLastLinkId = anchorLinkId };
            var response = await client.Api.Photos.GetTimelinePhotosAsync(request, cancellationToken).ConfigureAwait(false);

            anchorLinkId = response.Photos.Count == TimelinePageSize ? response.Photos[^1].Id : null;

            foreach (var photo in response.Photos)
            {
                var photoUid = new NodeUid(photosVolumeId, photo.Id);

                yield return new PhotosTimelineItem(photoUid, photo.CaptureTime);
            }
        } while (anchorLinkId is not null);
    }

    public static async IAsyncEnumerable<NodeUid> EnumerateAlbumNodeUidsAsync(
        ProtonDriveClient client,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var volumeId = await VolumeOperations.TryGetPhotosVolumeIdAsync(client, cancellationToken).ConfigureAwait(false);

        if (volumeId is null)
        {
            // No photos volume means there are no albums to enumerate
            yield break;
        }

        var anchorId = default(LinkId?);

        do
        {
            var response = await client.Api.Photos.GetAlbumsAsync(volumeId.Value, anchorId, cancellationToken).ConfigureAwait(false);

            foreach (var album in response.Albums)
            {
                yield return new NodeUid(volumeId.Value, album.Id);
            }

            anchorId = response is { More: true, AnchorId: not null } ? response.AnchorId : null;
        } while (anchorId is not null);
    }

    public static async IAsyncEnumerable<AlbumItem> EnumerateAlbumAsync(
        ProtonDriveClient client,
        NodeUid albumUid,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorId = default(LinkId?);

        do
        {
            var response = await client.Api.Photos
                .GetAlbumItemsAsync(albumUid.VolumeId, albumUid.LinkId, anchorId, cancellationToken).ConfigureAwait(false);

            foreach (var photo in response.Photos)
            {
                var photoUid = new NodeUid(albumUid.VolumeId, photo.Id);

                yield return new AlbumItem(photoUid, photo.CaptureTime);
            }

            anchorId = response is { More: true, AnchorId: not null } ? response.AnchorId : null;
        } while (anchorId is not null);
    }

    private static async ValueTask<FolderNode> CreatePhotosFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (_, _, folderNode) = await VolumeOperations.CreatePhotosVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }
}
