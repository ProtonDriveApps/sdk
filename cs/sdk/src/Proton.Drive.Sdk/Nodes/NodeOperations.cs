using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeOperations
{
    internal static async ValueTask<FolderNode> GetMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var shareId = await client.Cache.Entities.TryGetMyFilesShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            return await GetMyFilesFolderWithoutCacheAsync(client, cancellationToken).ConfigureAwait(false);
        }

        var share = await ShareOperations.GetShareAsync(client, shareId.Value, cancellationToken).ConfigureAwait(false);

        var node = await GetNodeAsync(client, share.Id, share.RootFolderId, cancellationToken).ConfigureAwait(false);

        return (FolderNode)node;
    }

    private static async ValueTask<Node> GetNodeAsync(
        ProtonDriveClient client,
        ShareId shareId,
        NodeUid nodeId,
        CancellationToken cancellationToken)
    {
        var node = await client.Cache.Entities.TryGetNodeAsync(nodeId, cancellationToken).ConfigureAwait(false);

        if (node is null)
        {
            var response = await client.Api.Links.GetLinkDetailsAsync(nodeId.VolumeId, [nodeId.LinkId], cancellationToken).ConfigureAwait(false);

            var (link, folder) = response.Links[0];

            // TODO: make this work with nodes other than the root folder by getting the actual parent key instead of always passing the share key
            var shareKey = await client.Cache.Secrets.TryGetShareKeyAsync(shareId, cancellationToken).ConfigureAwait(false);

            var decryptionResult = await NodeCrypto.DecryptNodeAsync(client, nodeId, link, folder, shareKey!.Value, cancellationToken).ConfigureAwait(false);

            if (!decryptionResult.TryGetValue(out node, out var decryptionError))
            {
                throw decryptionError.ToException();
            }
        }

        return node;
    }

    private static async ValueTask<FolderNode> GetMyFilesFolderWithoutCacheAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        PgpPrivateKey shareKey;
        ShareVolumeDto volume;
        ShareDto share;
        LinkDto link;
        FolderDto? folder;

        try
        {
            (volume, share, (link, folder)) = await client.Api.Shares.GetMyFilesShareAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException e) when (e.Code == ResponseCode.DoesNotExist)
        {
            return await CreateMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        shareKey = await ShareOperations.DecryptShareKeyAsync(client, share.Id, share.Key, share.Passphrase, share.AddressId, cancellationToken)
            .ConfigureAwait(false);

        var nodeId = new NodeUid(volume.Id, link.Id);

        var decryptionResult = await NodeCrypto.DecryptNodeAsync(client, nodeId, link, folder, shareKey, cancellationToken).ConfigureAwait(false);

        if (!decryptionResult.TryGetValue(out var node, out var decryptionError))
        {
            throw decryptionError.ToException();
        }

        var folderNode = (FolderNode)node;

        await SetMyFilesInCacheAsync(client.Cache.Entities, new Share(share.Id, folderNode.Id), folderNode, cancellationToken).ConfigureAwait(false);

        return (FolderNode)node;
    }

    private static async ValueTask<FolderNode> CreateMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (volume, folderNode) = await VolumeOperations.CreateVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        var share = new Share(volume.RootShareId, volume.RootFolderId);

        await SetMyFilesInCacheAsync(client.Cache.Entities, share, folderNode, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    private static async ValueTask SetMyFilesInCacheAsync(IDriveEntityCache cache, Share share, FolderNode folderNode, CancellationToken cancellationToken)
    {
        await cache.SetNodeAsync(folderNode, cancellationToken).ConfigureAwait(false);
        await cache.SetMyFilesShareIdAsync(share.Id, cancellationToken).ConfigureAwait(false);
        await cache.SetShareAsync(share, cancellationToken).ConfigureAwait(false);
    }
}
