using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Shares;

internal static class ShareCrypto
{
    public static async ValueTask<(Share Share, PgpPrivateKey Key)> DecryptShareAsync(
        ProtonDriveClient client,
        ShareId shareId,
        PgpArmoredPrivateKey lockedKey,
        PgpArmoredMessage passphraseMessage,
        AddressId addressId,
        NodeUid rootFolderId,
        ShareType shareType,
        CancellationToken cancellationToken)
    {
        var addressKeys = await client.Account.GetAddressPrivateKeysAsync(addressId, cancellationToken).ConfigureAwait(false);

        // FIXME use node if available instead of address key
        var passphrase = new PgpPrivateKeyRing(addressKeys).Decrypt(passphraseMessage);

        var key = PgpPrivateKey.ImportAndUnlock(lockedKey, passphrase);

        var share = new Share(shareId, rootFolderId, addressId, shareType);

        return (share, key);
    }
}
