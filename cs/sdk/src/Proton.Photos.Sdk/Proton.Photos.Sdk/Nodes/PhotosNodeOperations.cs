using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Photos.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Photos.Sdk.Nodes;

internal static class PhotosNodeOperations
{
    public static async ValueTask<FolderNode> GetPhotosFolderAsync(ProtonPhotosClient client, CancellationToken cancellationToken)
    {
        var shareId = await client.Cache.Entities.TryGetPhotosShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            return await GetFreshPhotosFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        var shareAndKey = await ShareOperations.GetShareAsync(client.DriveClient, shareId.Value, cancellationToken).ConfigureAwait(false);

        var metadata = await NodeOperations.GetNodeMetadataAsync(client.DriveClient, shareAndKey.Share.RootFolderId, shareAndKey, cancellationToken).ConfigureAwait(false);

        return (FolderNode)metadata.Node;
    }

    private static async ValueTask<FolderNode> GetFreshPhotosFolderAsync(ProtonPhotosClient photosClient, CancellationToken cancellationToken)
    {
        ShareVolumeDto volumeDto;
        ShareDto shareDto;
        LinkDetailsDto linkDetailsDto;

        try
        {
            (volumeDto, shareDto, linkDetailsDto) = await photosClient.PhotosApi.GetRootShareAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException e) when (e.Code == ResponseCode.DoesNotExist)
        {
            return await CreatePhotosFolderAsync(photosClient, cancellationToken).ConfigureAwait(false);
        }

        await photosClient.Cache.Entities.SetPhotosShareIdAsync(shareDto.Id, cancellationToken).ConfigureAwait(false);

        var nodeUid = new NodeUid(volumeDto.Id, linkDetailsDto.Link.Id);

        var (share, shareKey) = await ShareCrypto.DecryptShareAsync(
            photosClient.DriveClient,
            shareDto.Id,
            shareDto.Key,
            shareDto.Passphrase,
            shareDto.AddressId,
            nodeUid,
            cancellationToken).ConfigureAwait(false);

        await photosClient.DriveClient.Cache.Secrets.SetShareKeyAsync(share.Id, shareKey, cancellationToken).ConfigureAwait(false);
        await photosClient.DriveClient.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);

        var metadataResult = await DtoToMetadataConverter.ConvertDtoToFolderMetadataAsync(
                photosClient.DriveClient,
                volumeDto.Id,
                linkDetailsDto,
                shareKey,
                cancellationToken)
            .ConfigureAwait(false);

        return metadataResult.GetValueOrThrow().Node;
    }

    private static async ValueTask<FolderNode> CreatePhotosFolderAsync(ProtonPhotosClient photosClient, CancellationToken cancellationToken)
    {
        var (_, _, folderNode) = await VolumeOperations.CreatePhotosVolumeAsync(photosClient, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }
}
