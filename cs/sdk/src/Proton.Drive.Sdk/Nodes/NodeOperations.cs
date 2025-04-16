using System.Runtime.CompilerServices;
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
    public static async ValueTask<FolderNode> GetMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var shareId = await client.Cache.Entities.TryGetMyFilesShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            return await GetFreshMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        var shareAndKey = await ShareOperations.GetShareAsync(client, shareId.Value, cancellationToken).ConfigureAwait(false);

        var node = await GetNodeAsync(client, shareAndKey.Share.RootFolderId, shareAndKey, cancellationToken).ConfigureAwait(false);

        return (FolderNode)node;
    }

    public static async IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateFolderChildrenAsync(
        ProtonDriveClient client,
        NodeUid folderId,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorId = default(LinkId?);
        var mustTryMoreResults = true;

        var folderSecrets = await GetFolderSecretsAsync(client, folderId, cancellationToken).ConfigureAwait(false);

        var batchLoader = new FolderChildrenBatchLoader(client, folderId.VolumeId, folderSecrets.Key);

        while (mustTryMoreResults)
        {
            var response = await client.Api.Folders.GetChildrenAsync(folderId.VolumeId, folderId.LinkId, anchorId, cancellationToken).ConfigureAwait(false);

            mustTryMoreResults = response.MoreResultsExist;
            anchorId = response.AnchorId;

            foreach (var childLinkId in response.LinkIds)
            {
                var childId = new NodeUid(folderId.VolumeId, childLinkId);

                var cachedChildNodeInfo = await client.Cache.Entities.TryGetNodeAsync(childId, cancellationToken).ConfigureAwait(false);

                if (cachedChildNodeInfo is null)
                {
                    foreach (var nodeResult in await batchLoader.QueueAndTryLoadBatchAsync(childLinkId, cancellationToken).ConfigureAwait(false))
                    {
                        yield return nodeResult;
                    }
                }
                else
                {
                    yield return cachedChildNodeInfo.Value.NodeProvisionResult;
                }
            }
        }

        foreach (var node in await batchLoader.LoadRemainingAsync(cancellationToken).ConfigureAwait(false))
        {
            yield return node;
        }
    }

    private static async ValueTask<FolderSecrets> GetFolderSecretsAsync(ProtonDriveClient client, NodeUid folderId, CancellationToken cancellationToken)
    {
        var folderSecrets = await client.Cache.Secrets.TryGetFolderSecretsAsync(folderId, cancellationToken).ConfigureAwait(false);

        if (folderSecrets is null)
        {
            var nodeProvisionResult = await GetFreshNodeAndSecretsAsync(client, folderId, knownShareAndKey: null, cancellationToken).ConfigureAwait(false);

            folderSecrets = nodeProvisionResult.GetFolderSecretsOrThrow();
        }

        return folderSecrets;
    }

    private static async ValueTask<Node> GetNodeAsync(
        ProtonDriveClient client,
        NodeUid nodeId,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var cachedNodeInfo = await client.Cache.Entities.TryGetNodeAsync(nodeId, cancellationToken).ConfigureAwait(false);

        if (cachedNodeInfo is not var (nodeResult, _, _))
        {
            var nodeAndSecretsResult = await GetFreshNodeAndSecretsAsync(client, nodeId, knownShareAndKey, cancellationToken).ConfigureAwait(false);

            nodeResult = nodeAndSecretsResult.ToNodeResult();
        }

        return nodeResult.GetValueOrThrow();
    }

    private static async ValueTask<FolderNode> GetFreshMyFilesFolderAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        PgpPrivateKey shareKey;
        ShareVolumeDto volume;
        ShareDto share;
        LinkDetailsDto linkDetails;

        try
        {
            (volume, share, linkDetails) = await client.Api.Shares.GetMyFilesShareAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException e) when (e.Code == ResponseCode.DoesNotExist)
        {
            return await CreateMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        shareKey = await ShareCrypto.DecryptShareKeyAsync(client, share.Id, share.Key, share.Passphrase, share.AddressId, cancellationToken)
            .ConfigureAwait(false);

        var nodeId = new NodeUid(volume.Id, linkDetails.Link.Id);

        var nodeProvisionResult = await NodeCrypto.DecryptNodeAsync(client, nodeId, linkDetails, shareKey, cancellationToken).ConfigureAwait(false);

        var folderNode = nodeProvisionResult.GetFolderNodeOrThrow();

        await SetMyFilesInCacheAsync(client.Cache.Entities, new Share(share.Id, folderNode.Id), folderNode, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    private static async ValueTask<Result<NodeAndSecrets, DegradedNodeAndSecrets>> GetFreshNodeAndSecretsAsync(
        ProtonDriveClient client,
        NodeUid nodeId,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var response = await client.Api.Links.GetLinkDetailsAsync(nodeId.VolumeId, [nodeId.LinkId], cancellationToken).ConfigureAwait(false);

        var linkDetails = response.Links[0];

        var parentKeyResult = await GetParentKeyAsync(
            client,
            nodeId.VolumeId,
            linkDetails.Link.ParentId,
            knownShareAndKey,
            linkDetails.Membership?.ShareId,
            cancellationToken).ConfigureAwait(false);

        return await NodeCrypto.DecryptNodeAsync(client, nodeId, linkDetails, parentKeyResult, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<Result<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? childMembershipShareId,
        CancellationToken cancellationToken)
    {
        if (childMembershipShareId is not null && childMembershipShareId == shareAndKeyToUse?.Share.Id)
        {
            return shareAndKeyToUse.Value.Key;
        }

        var currentId = parentId;
        var currentMembershipShareId = childMembershipShareId;

        var linkAncestry = new Stack<LinkDetailsDto>(8);

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

                var folderSecrets = await client.Cache.Secrets.TryGetFolderSecretsAsync(new NodeUid(volumeId, currentId.Value), cancellationToken)
                    .ConfigureAwait(false);

                if (folderSecrets is not null)
                {
                    lastKey = folderSecrets.Key;
                    break;
                }

                var linkDetailsResponse = await client.Api.Links.GetLinkDetailsAsync(volumeId, [currentId.Value], cancellationToken).ConfigureAwait(false);

                var linkDetails = linkDetailsResponse.Links[0];

                linkAncestry.Push(linkDetails);

                var (link, _, _, membership) = linkDetails;

                currentId = link.ParentId;

                currentMembershipShareId = membership?.ShareId;
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
                if (currentMembershipShareId is null)
                {
                    return new ProtonDriveError("No membership available to access node");
                }

                (_, currentParentKey) = await ShareOperations.GetShareAsync(client, currentMembershipShareId.Value, cancellationToken).ConfigureAwait(false);
            }
        }

        while (linkAncestry.TryPop(out var ancestorLinkDetails))
        {
            var decryptionResult = await NodeCrypto.DecryptNodeAsync(
                client,
                new NodeUid(volumeId, ancestorLinkDetails.Link.Id),
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

    private static async ValueTask<FolderNode> CreateMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (volume, folderNode) = await VolumeOperations.CreateVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        var share = new Share(volume.RootShareId, volume.RootFolderId);

        await SetMyFilesInCacheAsync(client.Cache.Entities, share, folderNode, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    private static async ValueTask SetMyFilesInCacheAsync(
        IDriveEntityCache cache,
        Share share,
        FolderNode folderNode,
        CancellationToken cancellationToken)
    {
        // The My Files root folder never has siblings and does not need a name hash digest
        var nameHashDigest = ReadOnlyMemory<byte>.Empty;

        await cache.SetNodeAsync(folderNode.Id, folderNode, share.Id, nameHashDigest, cancellationToken).ConfigureAwait(false);
        await cache.SetMyFilesShareIdAsync(share.Id, cancellationToken).ConfigureAwait(false);
        await cache.SetShareAsync(share, cancellationToken).ConfigureAwait(false);
    }
}
