using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
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
        var shareId = await client.Cache.Entities.TryGetPhotosShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            try
            {
                return await GetFreshExistingPhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException e) when (e.Code is ResponseCode.DoesNotExist)
            {
                await client.Cache.Entities.SetPhotosVolumeIdAsync(null, cancellationToken).AsTask().ConfigureAwait(false);
                return null;
            }
        }

        var shareAndKey = await ShareOperations.GetShareAsync(client, shareId.Value, useCacheOnly: false, cancellationToken).ConfigureAwait(false);

        var metadata = await NodeOperations.GetNodeMetadataAsync(
            client,
            shareAndKey.Share.RootFolderId,
            shareAndKey,
            useCacheOnly: false,
            cancellationToken).ConfigureAwait(false);

        return (FolderNode)metadata.GetValueOrThrow().Node;
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

    private static async ValueTask<FolderNode> GetFreshExistingPhotosFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (volumeDto, shareDto, linkDetailsDto) = await client.Api.Photos.GetRootShareAsync(cancellationToken).ConfigureAwait(false);

        await client.Cache.Entities.SetPhotosShareIdAsync(shareDto.Id, cancellationToken).ConfigureAwait(false);

        var nodeUid = new NodeUid(volumeDto.Id, linkDetailsDto.Link.Id);

        var (share, shareKey) = await ShareCrypto.DecryptShareAsync(
            client,
            shareDto.Id,
            shareDto.Key,
            shareDto.Passphrase,
            shareDto.AddressId,
            nodeUid,
            ShareType.Photos,
            cancellationToken).ConfigureAwait(false);

        await client.Cache.Secrets.SetShareKeyAsync(share.Id, shareKey, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);

        var metadataResult = await DtoToMetadataConverter.ConvertDtoToFolderMetadataAsync(
            client,
            volumeDto.Id,
            linkDetailsDto,
            shareKey,
            cancellationToken)
            .ConfigureAwait(false);

        return metadataResult.GetValueOrThrow().Node;
    }

    private static async ValueTask<FolderNode> CreatePhotosFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (_, _, folderNode) = await VolumeOperations.CreatePhotosVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }
}
