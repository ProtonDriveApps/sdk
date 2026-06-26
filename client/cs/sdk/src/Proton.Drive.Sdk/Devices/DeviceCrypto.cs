using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api.Devices;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Devices;

internal static class DeviceCrypto
{
    public static DeviceCreationRequest GetCreationRequest(
        string name,
        DeviceType deviceType,
        AddressId addressId,
        AddressKeyId addressKeyId,
        PgpPrivateKey addressKey)
    {
        var shareKey = CryptoGenerator.GeneratePrivateKey();

        var rootFolderKey = CryptoGenerator.GeneratePrivateKey();
        var rootFolderPassphraseSessionKey = CryptoGenerator.GenerateSessionKey();
        var rootFolderNameSessionKey = CryptoGenerator.GenerateSessionKey();
        var rootFolderHashKey = CryptoGenerator.GenerateFolderHashKey();

        Span<byte> sharePassphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var sharePassphrase = CryptoGenerator.GeneratePassphrase(sharePassphraseBuffer);
        var lockedShareKey = shareKey.Lock(sharePassphrase);

        var encryptedSharePassphrase = addressKey.EncryptAndSign(sharePassphrase, addressKey, out var sharePassphraseSignature);

        Span<byte> folderPassphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var folderPassphrase = CryptoGenerator.GeneratePassphrase(folderPassphraseBuffer);

        var lockedFolderKey = rootFolderKey.Lock(folderPassphrase);

        var folderPassphraseEncryptionSecrets = new EncryptionSecrets(shareKey, rootFolderPassphraseSessionKey);
        var encryptedFolderPassphrase = PgpEncrypter.EncryptAndSign(
            folderPassphrase,
            folderPassphraseEncryptionSecrets,
            addressKey,
            out var folderPassphraseSignature);

        var nameEncryptionSecrets = new EncryptionSecrets(shareKey, rootFolderNameSessionKey);
        var encryptedName = PgpEncrypter.EncryptAndSignText(name, nameEncryptionSecrets, addressKey);

        var encryptedHashKey = rootFolderKey.EncryptAndSign(rootFolderHashKey, addressKey);

        return new DeviceCreationRequest
        {
            Device = new DeviceCreationDeviceDto
            {
                Type = deviceType,
                SyncState = 0,
            },
            Share = new DeviceCreationShareDto
            {
                AddressId = addressId,
                AddressKeyId = addressKeyId,
                Key = lockedShareKey,
                Passphrase = encryptedSharePassphrase,
                PassphraseSignature = sharePassphraseSignature,
            },
            Link = new DeviceCreationLinkDto
            {
                Name = encryptedName,
                NodeKey = lockedFolderKey,
                NodePassphrase = encryptedFolderPassphrase,
                NodePassphraseSignature = folderPassphraseSignature,
                NodeHashKey = encryptedHashKey,
            },
        };
    }

    public static RenameLinkRequest GetRenameRequest(
        string name,
        PgpPrivateKey shareKey,
        PgpSessionKey nameSessionKey,
        PgpPrivateKey signingKey,
        string nameSignatureEmailAddress)
    {
        // A device's name lives on its root folder. Root nodes have no siblings, so their name is encrypted with the
        // (context) share key rather than a parent folder key, and it is not hashed.
        var encryptedName = PgpEncrypter.EncryptAndSignText(name, new EncryptionSecrets(shareKey, nameSessionKey), signingKey);

        return new RenameLinkRequest
        {
            Name = encryptedName,
            NameHashDigest = ReadOnlyMemory<byte>.Empty,
            NameSignatureEmailAddress = nameSignatureEmailAddress,
            MediaType = null,
            OriginalNameHashDigest = ReadOnlyMemory<byte>.Empty,
        };
    }
}
