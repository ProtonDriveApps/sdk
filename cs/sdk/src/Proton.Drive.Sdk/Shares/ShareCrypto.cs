using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Shares;

internal static class ShareCrypto
{
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
