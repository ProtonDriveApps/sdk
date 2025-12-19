using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;

namespace Proton.Drive.Sdk.Shares;

internal static class ShareOperations
{
    public static async ValueTask<ShareAndKey> GetShareAsync(
        ProtonDriveClient client,
        ShareId shareId,
        CancellationToken cancellationToken)
    {
        var share = await client.Cache.Entities.TryGetShareAsync(shareId, cancellationToken).ConfigureAwait(false);
        var shareKey = await client.Cache.Secrets.TryGetShareKeyAsync(shareId, cancellationToken).ConfigureAwait(false);

        if (share is null || shareKey is null)
        {
            var response = await client.Api.Shares.GetShareAsync(shareId, cancellationToken).ConfigureAwait(false);

            var rootFolderId = new NodeUid(response.VolumeId, response.RootLinkId);

            (share, shareKey) = await ShareCrypto.DecryptShareAsync(
                client,
                shareId,
                response.Key,
                response.Passphrase,
                response.AddressId,
                rootFolderId,
                cancellationToken).ConfigureAwait(false);

            await client.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);
            await client.Cache.Secrets.SetShareKeyAsync(shareId, shareKey.Value, cancellationToken).ConfigureAwait(false);
        }

        return new ShareAndKey(share, shareKey.Value);
    }

    public static async ValueTask<ShareAndKey> GetContextShareAsync(ProtonDriveClient client, NodeUid nodeUid, CancellationToken cancellationToken)
    {
        var response = await client.Api.Links.GetContextShareAsync(nodeUid.VolumeId, nodeUid.LinkId, cancellationToken).ConfigureAwait(false);

        return await GetShareAsync(client, response.ContextShareId, cancellationToken).ConfigureAwait(false);
    }
}
