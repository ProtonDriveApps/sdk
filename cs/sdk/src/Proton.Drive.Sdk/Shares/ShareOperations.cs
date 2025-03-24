using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Shares;

internal static class ShareOperations
{
    public static async ValueTask<Share> GetShareAsync(ProtonDriveClient client, ShareId shareId, CancellationToken cancellationToken)
    {
        var share = await client.Cache.Entities.TryGetShareAsync(shareId, cancellationToken).ConfigureAwait(false);

        if (share is null)
        {
            var response = await client.Api.Shares.GetShareAsync(shareId, cancellationToken).ConfigureAwait(false);

            await DecryptShareKeyAsync(client, shareId, response.Key, response.Passphrase, response.AddressId, cancellationToken).ConfigureAwait(false);

            share = new Share(shareId, new NodeUid(response.VolumeId, response.RootLinkId));
        }

        return share;
    }

    public static async ValueTask<PgpPrivateKey> DecryptShareKeyAsync(
        ProtonDriveClient client,
        ShareId shareId,
        PgpArmoredPrivateKey lockedKey,
        PgpArmoredMessage passphraseMessage,
        AddressId addressId,
        CancellationToken cancellationToken)
    {
        var addressKeys = await client.Account.GetAddressKeysAsync(addressId, cancellationToken).ConfigureAwait(false);

        var passphrase = new PgpPrivateKeyRing(addressKeys).Decrypt(passphraseMessage);

        var key = PgpPrivateKey.ImportAndUnlock(lockedKey, passphrase);

        await client.Cache.Secrets.SetShareKeyAsync(shareId, key, cancellationToken).ConfigureAwait(false);

        return key;
    }
}
