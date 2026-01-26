using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Photos.Sdk.Api.Photos;
using Proton.Sdk.Addresses;

namespace Proton.Photos.Sdk.Volumes;

internal static class VolumeOperations
{
    private const string RootFolderName = "root";

    public static async ValueTask<(Volume Volume, Share Share, FolderNode RootFolder)> CreatePhotosVolumeAsync(
        ProtonPhotosClient photosClient,
        CancellationToken cancellationToken)
    {
        var defaultAddress = await photosClient.DriveClient.Account.GetDefaultAddressAsync(cancellationToken).ConfigureAwait(false);

        var addressKey = await photosClient.DriveClient.Account.GetAddressPrimaryPrivateKeyAsync(defaultAddress.Id, cancellationToken).ConfigureAwait(false);

        var addressKeyId = defaultAddress.GetPrimaryKey().AddressKeyId;

        var request = GetCreationRequest(defaultAddress.Id, addressKeyId, addressKey, out var rootShareKey, out var rootFolderSecrets);

        var response = await photosClient.PhotosApi.CreateVolumeAsync(request, cancellationToken).ConfigureAwait(false);

        var volume = new Volume(response.Volume);

        var share = new Share(volume.RootShareId, volume.RootFolderId, defaultAddress.Id, ShareType.Photos);

        var rootFolder = new FolderNode
        {
            Uid = volume.RootFolderId,
            ParentUid = null,
            Name = RootFolderName,
            NameAuthor = new Author { EmailAddress = defaultAddress.EmailAddress },
            Author = new Author { EmailAddress = defaultAddress.EmailAddress },
            CreationTime = DateTime.UtcNow,
        };

        // The volume root folder never has siblings and does not need a name hash digest
        var nameHashDigest = ReadOnlyMemory<byte>.Empty;

        await photosClient.Cache.Entities.SetPhotosVolumeIdAsync(volume.Id, cancellationToken).ConfigureAwait(false);
        await photosClient.Cache.Entities.SetNodeAsync(volume.RootFolderId, rootFolder, share.Id, nameHashDigest, cancellationToken).ConfigureAwait(false);
        await photosClient.Cache.Entities.SetPhotosShareIdAsync(share.Id, cancellationToken).ConfigureAwait(false);
        await photosClient.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);

        await photosClient.Cache.Secrets.SetShareKeyAsync(volume.RootShareId, rootShareKey, cancellationToken).ConfigureAwait(false);
        await photosClient.Cache.Secrets.SetFolderSecretsAsync(volume.RootFolderId, rootFolderSecrets, cancellationToken).ConfigureAwait(false);

        return (volume, share, rootFolder);
    }

    private static PhotosVolumeCreationRequest GetCreationRequest(
        AddressId addressId,
        AddressKeyId addressKeyId,
        PgpPrivateKey addressKey,
        out PgpPrivateKey rootShareKey,
        out FolderSecrets rootFolderSecrets)
    {
        rootShareKey = CryptoGenerator.GeneratePrivateKey();

        rootFolderSecrets = new FolderSecrets
        {
            Key = CryptoGenerator.GeneratePrivateKey(),
            PassphraseSessionKey = CryptoGenerator.GenerateSessionKey(),
            NameSessionKey = CryptoGenerator.GenerateSessionKey(),
            HashKey = CryptoGenerator.GenerateFolderHashKey(),
        };

        Span<byte> sharePassphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var sharePassphrase = CryptoGenerator.GeneratePassphrase(sharePassphraseBuffer);
        using var lockedShareKey = rootShareKey.Lock(sharePassphrase);

        var encryptedSharePassphrase = addressKey.EncryptAndSign(sharePassphrase, addressKey, out var sharePassphraseSignature);

        Span<byte> folderPassphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var folderPassphrase = CryptoGenerator.GeneratePassphrase(folderPassphraseBuffer);
        using var lockedFolderKey = rootFolderSecrets.Key.Lock(folderPassphrase);

        var folderPassphraseEncryptionSecrets = new EncryptionSecrets(rootShareKey, rootFolderSecrets.PassphraseSessionKey);
        var encryptedFolderPassphrase = PgpEncrypter.EncryptAndSign(
            folderPassphrase,
            folderPassphraseEncryptionSecrets,
            addressKey,
            out var folderPassphraseSignature);

        var nameEncryptionSecrets = new EncryptionSecrets(rootShareKey, rootFolderSecrets.NameSessionKey);
        var encryptedName = PgpEncrypter.EncryptAndSignText(RootFolderName, nameEncryptionSecrets, addressKey);

        var encryptedHashKey = rootFolderSecrets.Key.EncryptAndSign(rootFolderSecrets.HashKey.Span, addressKey);

        return new PhotosVolumeCreationRequest
        {
            Share = new PhotosVolumeShareCreationParameters
            {
                AddressId = addressId,
                AddressKeyId = addressKeyId,
                Key = lockedShareKey.ToBytes(),
                Passphrase = encryptedSharePassphrase,
                PassphraseSignature = sharePassphraseSignature,
            },
            Link = new PhotosVolumeLinkCreationParameters
            {
                Name = encryptedName,
                NodeKey = lockedFolderKey.ToBytes(),
                NodePassphrase = encryptedFolderPassphrase,
                NodePassphraseSignature = folderPassphraseSignature,
                NodeHashKey = encryptedHashKey,
            },
        };
    }
}
