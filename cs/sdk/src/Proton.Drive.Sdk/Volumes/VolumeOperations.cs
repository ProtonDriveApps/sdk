using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Volumes;

internal static class VolumeOperations
{
    private const string RootFolderName = "root";

    internal static async ValueTask<(Volume Volume, Share Share, FolderNode RootFolder)> CreateVolumeAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        var defaultAddress = await client.Account.GetDefaultAddressAsync(cancellationToken).ConfigureAwait(false);

        var addressKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(defaultAddress.Id, cancellationToken).ConfigureAwait(false);

        var parameters = GetCreationParameters(defaultAddress.Id, addressKey, out var rootShareKey, out var rootFolderSecrets);

        var response = await client.Api.Volumes.CreateVolumeAsync(parameters, cancellationToken).ConfigureAwait(false);

        var volume = new Volume(response.Volume);

        var share = new Share(volume.RootShareId, volume.RootFolderId, defaultAddress.Id);

        var rootFolder = new FolderNode
        {
            Uid = volume.RootFolderId,
            ParentUid = null,
            Name = RootFolderName,
            NameAuthor = new Author { EmailAddress = defaultAddress.EmailAddress },
            Author = new Author { EmailAddress = defaultAddress.EmailAddress },
            IsTrashed = false,
        };

        // The volume root folder never has siblings and does not need a name hash digest
        var nameHashDigest = ReadOnlyMemory<byte>.Empty;

        await client.Cache.Entities.SetMainVolumeIdAsync(volume.Id, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetNodeAsync(volume.RootFolderId, rootFolder, share.Id, nameHashDigest, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetMyFilesShareIdAsync(share.Id, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);

        await client.Cache.Secrets.SetShareKeyAsync(volume.RootShareId, rootShareKey, cancellationToken).ConfigureAwait(false);
        await client.Cache.Secrets.SetFolderSecretsAsync(volume.RootFolderId, rootFolderSecrets, cancellationToken).ConfigureAwait(false);

        return (volume, share, rootFolder);
    }

    private static VolumeCreationParameters GetCreationParameters(
        AddressId addressId,
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

        return new VolumeCreationParameters
        {
            AddressId = addressId,
            ShareKey = lockedShareKey.ToBytes(),
            SharePassphrase = encryptedSharePassphrase,
            SharePassphraseSignature = sharePassphraseSignature,
            FolderName = encryptedName,
            FolderKey = lockedFolderKey.ToBytes(),
            FolderPassphrase = encryptedFolderPassphrase,
            FolderPassphraseSignature = folderPassphraseSignature,
            FolderHashKey = encryptedHashKey,
        };
    }
}
