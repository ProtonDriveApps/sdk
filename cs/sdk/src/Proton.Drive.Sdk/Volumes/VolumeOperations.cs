using System.Runtime.CompilerServices;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Volumes;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Shares;
using Proton.Sdk;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Volumes;

internal static class VolumeOperations
{
    private const string RootFolderName = "root";
    private const int TrashPageSize = 500;

    public static async ValueTask<(Volume Volume, Share Share, FolderNode RootFolder)> CreateVolumeAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        var defaultAddress = await client.Account.GetDefaultAddressAsync(cancellationToken).ConfigureAwait(false);

        var addressKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(defaultAddress.Id, cancellationToken).ConfigureAwait(false);

        var request = GetCreationRequest(defaultAddress.Id, addressKey, out var rootShareKey, out var rootFolderSecrets);

        var response = await client.Api.Volumes.CreateVolumeAsync(request, cancellationToken).ConfigureAwait(false);

        var volume = new Volume(response.Volume);

        var share = new Share(volume.RootShareId, volume.RootFolderId, defaultAddress.Id);

        var rootFolder = new FolderNode
        {
            Uid = volume.RootFolderId,
            ParentUid = null,
            Name = RootFolderName,
            NameAuthor = new Author { EmailAddress = defaultAddress.EmailAddress },
            Author = new Author { EmailAddress = defaultAddress.EmailAddress },
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

    public static async IAsyncEnumerable<RefResult<Node, DegradedNode>> EnumerateTrashAsync(
        ProtonDriveClient client,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var volumeId = await GetMainVolumeIdAsync(client, cancellationToken).ConfigureAwait(false);

        var page = 0;
        var mustTryMoreResults = true;

        while (mustTryMoreResults)
        {
            var response = await client.Api.Volumes.GetTrashAsync(volumeId, TrashPageSize, page, cancellationToken).ConfigureAwait(false);

            mustTryMoreResults = response.TrashByShare.Sum(x => x.LinkIds.Count) == TrashPageSize;

            foreach (var (shareId, linkIds, _) in response.TrashByShare)
            {
                var (_, shareKey) = await ShareOperations.GetShareAsync(client, shareId, cancellationToken).ConfigureAwait(false);

                var batchLoader = new VolumeTrashBatchLoader(client, volumeId, shareKey);

                foreach (var linkId in linkIds)
                {
                    var uid = new NodeUid(volumeId, linkId);

                    var cachedNodeInfo = await client.Cache.Entities.TryGetNodeAsync(uid, cancellationToken).ConfigureAwait(false);

                    if (cachedNodeInfo is null)
                    {
                        foreach (var nodeResult in await batchLoader.QueueAndTryLoadBatchAsync(linkId, cancellationToken).ConfigureAwait(false))
                        {
                            yield return nodeResult;
                        }
                    }
                    else
                    {
                        yield return cachedNodeInfo.Value.NodeProvisionResult;
                    }
                }

                foreach (var node in await batchLoader.LoadRemainingAsync(cancellationToken).ConfigureAwait(false))
                {
                    yield return node;
                }
            }

            ++page;
        }
    }

    public static async ValueTask EmptyTrashAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var volumeId = await GetMainVolumeIdAsync(client, cancellationToken).ConfigureAwait(false);

        await client.Api.Volumes.EmptyTrashAsync(volumeId, cancellationToken).ConfigureAwait(false);
    }

    private static VolumeCreationRequest GetCreationRequest(
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

        return new VolumeCreationRequest
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

    private static async ValueTask<VolumeId> GetMainVolumeIdAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        // TODO: optimize this, which is overkill to just get the volume ID
        var myFilesFolder = await NodeOperations.GetMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);

        return myFilesFolder.Uid.VolumeId;
    }
}
