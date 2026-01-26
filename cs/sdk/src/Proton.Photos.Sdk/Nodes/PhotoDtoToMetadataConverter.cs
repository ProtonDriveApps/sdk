using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Photos.Sdk.Api;
using Proton.Sdk;

namespace Proton.Photos.Sdk.Nodes;

internal static class PhotoDtoToMetadataConverter
{
    public static async Task<Result<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonPhotosClient client,
        VolumeId volumeId,
        PhotoLinkDetailsDto photoLinkDetailsDto,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        if (photoLinkDetailsDto.Link.ParentId == null && photoLinkDetailsDto.Sharing?.ShareId == null && photoLinkDetailsDto.Photo?.Albums.Count == 0)
        {
            throw new InvalidOperationException("Photo node has no parent, share or album");
        }

        LinkId? parentId;

        if (photoLinkDetailsDto.Link.ParentId != null || photoLinkDetailsDto.Sharing?.ShareId != null)
        {
            parentId = photoLinkDetailsDto.Link.ParentId;
        }
        else
        {
            // TODO: Optimization
            // If more than one album is available, select an album with a cached key to avoid a redundant HTTP request and decryption.
            parentId = photoLinkDetailsDto.Photo?.Albums[0].Id;
        }

        var parentKeyResult = await GetParentKeyAsync(
            client,
            volumeId,
            parentId,
            knownShareAndKey,
            photoLinkDetailsDto.Sharing?.ShareId,
            cancellationToken).ConfigureAwait(false);

        return await ConvertDtoToNodeMetadataAsync(client, volumeId, photoLinkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<Result<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonPhotosClient client,
        VolumeId volumeId,
        PhotoLinkDetailsDto photoLinkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkType = photoLinkDetailsDto.Link.Type;
        var linkDetailsDto = photoLinkDetailsDto.ToLinkDetailsDto();

        return linkType switch
        {
            LinkType.File =>
                (await DtoToMetadataConverter.ConvertDtoToFileMetadataAsync(
                    client.DriveClient,
                    client.Cache.Entities,
                    client.Cache.Secrets,
                    volumeId,
                    linkDetailsDto,
                    parentKeyResult,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFile, DegradedNodeMetadata.FromFile),

            LinkType.Album =>
                (await DtoToMetadataConverter.ConvertDtoToFolderMetadataAsync(
                    client.DriveClient,
                    client.Cache.Entities,
                    client.Cache.Secrets,
                    volumeId,
                    linkDetailsDto,
                    parentKeyResult,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            LinkType.Folder =>
                (await DtoToMetadataConverter.ConvertDtoToFolderMetadataAsync(
                    client.DriveClient,
                    client.Cache.Entities,
                    client.Cache.Secrets,
                    volumeId,
                    linkDetailsDto,
                    parentKeyResult,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            _ => throw new NotSupportedException($"Link type {linkType} is not supported."),
        };
    }

    private static async ValueTask<Result<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
        ProtonPhotosClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? childShareId,
        CancellationToken cancellationToken)
    {
        if (childShareId is not null && childShareId == shareAndKeyToUse?.Share.Id)
        {
            return shareAndKeyToUse.Value.Key;
        }

        var currentId = parentId;
        var currentShareId = childShareId;

        // FIXME, we don't have nested folders in photos, max depth is 3 including photo.
        var linkAncestry = new Stack<PhotoLinkDetailsDto>(8);

        PgpPrivateKey? lastKey = null;

        try
        {
            while (currentId is not null)
            {
                if (shareAndKeyToUse is var (shareToUse, shareKeyToUse) && currentId == shareToUse.RootFolderId.LinkId)
                {
                    lastKey = shareKeyToUse;
                    break;
                }

                var nodeUid = new NodeUid(volumeId, currentId.Value);

                var folderSecretsResult = await client.Cache.Secrets.TryGetFolderSecretsAsync(nodeUid, cancellationToken).ConfigureAwait(false);

                var folderKey = folderSecretsResult?.Merge(x => x.Key, x => x.Key);

                if (folderKey is not null)
                {
                    lastKey = folderKey.Value;
                    break;
                }

                var response = await client.PhotosApi.GetDetailsAsync(volumeId, [currentId.Value], cancellationToken).ConfigureAwait(false);

                var photoLinkDetails = response.Links[0];

                linkAncestry.Push(photoLinkDetails);

                currentShareId = photoLinkDetails.Sharing?.ShareId;

                currentId = photoLinkDetails.Link.ParentId;
            }
        }
        catch (Exception e)
        {
            return new ProtonDriveError(e.Message);
        }

        if (lastKey is not { } currentParentKey)
        {
            if (shareAndKeyToUse is not null)
            {
                currentParentKey = shareAndKeyToUse.Value.Key;
            }
            else
            {
                if (currentShareId is null)
                {
                    return new ProtonDriveError("No share available to access node");
                }

                (_, currentParentKey) = await ShareOperations.GetShareAsync(client.DriveClient, currentShareId.Value, cancellationToken).ConfigureAwait(false);
            }
        }

        while (linkAncestry.TryPop(out var ancestorLinkDetails))
        {
            var decryptionResult = await ConvertDtoToNodeMetadataAsync(
                client,
                volumeId,
                ancestorLinkDetails,
                currentParentKey,
                cancellationToken).ConfigureAwait(false);

            if (!decryptionResult.TryGetFolderKeyElseError(out var folderKey, out var error))
            {
                // TODO: wrap error for more context?
                return error;
            }

            currentParentKey = folderKey.Value;
        }

        return currentParentKey;
    }
}
