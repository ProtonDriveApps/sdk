using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Volumes.Api;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Volumes;

internal static class VolumeOperations
{
    internal static async ValueTask<Volume> CreateAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var defaultAddress = await client.Account.GetDefaultAddressAsync(cancellationToken).ConfigureAwait(false);

        using var addressKey = await client.Account.GetAddressPrimaryKeyAsync(defaultAddress.Id, cancellationToken).ConfigureAwait(false);

        Span<byte> folderHashKey = stackalloc byte[CryptoGenerator.FolderHashKeyLength];
        CryptoGenerator.GenerateFolderHashKey(folderHashKey);

        var parameters = GetCreationParameters(defaultAddress.Id, addressKey, folderHashKey, out var rootShareKey, out var rootFolderKey);

        var response = await client.Api.Volumes.CreateVolumeAsync(parameters, cancellationToken).ConfigureAwait(false);

        var volume = new Volume(response.Volume);

        await client.Cache.Entities.SetMainVolumeIdAsync(volume.Id, cancellationToken).ConfigureAwait(false);
        await client.Cache.Secrets.SetShareKeyAsync(volume.RootShareId, rootShareKey, cancellationToken).ConfigureAwait(false);
        await client.Cache.Secrets.SetNodeKeyAsync(new NodeUid(volume.Id, volume.RootFolderId), rootFolderKey, cancellationToken).ConfigureAwait(false);

        return volume;
    }

    private static VolumeCreationParameters GetCreationParameters(
        AddressId addressId,
        PgpPrivateKey addressKey,
        ReadOnlySpan<byte> folderHashKey,
        out PgpPrivateKey rootShareKey,
        out PgpPrivateKey rootFolderKey)
    {
        const string folderName = "root";

        rootShareKey = CryptoGenerator.GeneratePrivateKey();
        Span<byte> shareKeyPassphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var shareKeyPassphrase = CryptoGenerator.GeneratePassphrase(shareKeyPassphraseBuffer);
        using var lockedShareKey = rootShareKey.Lock(shareKeyPassphrase);

        var encryptedShareKeyPassphrase = rootShareKey.EncryptAndSign(shareKeyPassphrase, addressKey, out var shareKeyPassphraseSignature);

        rootFolderKey = CryptoGenerator.GeneratePrivateKey();
        Span<byte> folderKeyPassphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var folderKeyPassphrase = CryptoGenerator.GeneratePassphrase(folderKeyPassphraseBuffer);
        using var lockedFolderKey = rootFolderKey.Lock(folderKeyPassphrase);

        var encryptedFolderKeyPassphrase = rootFolderKey.EncryptAndSign(folderKeyPassphrase, addressKey, out var folderKeyPassphraseSignature);

        return new VolumeCreationParameters
        {
            AddressId = addressId.Value,
            ShareKey = lockedShareKey.ToBytes(),
            ShareKeyPassphrase = encryptedShareKeyPassphrase,
            ShareKeyPassphraseSignature = shareKeyPassphraseSignature,
            FolderName = rootShareKey.EncryptAndSignText(folderName, addressKey),
            FolderKey = lockedFolderKey.ToBytes(),
            FolderKeyPassphrase = encryptedFolderKeyPassphrase,
            FolderKeyPassphraseSignature = folderKeyPassphraseSignature,
            FolderHashKey = rootFolderKey.EncryptAndSign(folderHashKey, addressKey),
        };
    }
}
