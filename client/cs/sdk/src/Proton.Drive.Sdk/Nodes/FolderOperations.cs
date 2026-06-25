using System.Runtime.CompilerServices;
using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Serialization;

namespace Proton.Drive.Sdk.Nodes;

internal static class FolderOperations
{
    public static async IAsyncEnumerable<NodeUid> EnumerateChildrenAsync(
        ProtonDriveClient client,
        NodeUid folderUid,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorLinkId = default(LinkId?);
        var mustTryMoreResults = true;

        while (mustTryMoreResults)
        {
            var response = await client.Api.Folders.GetChildrenAsync(folderUid.VolumeId, folderUid.LinkId, anchorLinkId, cancellationToken)
                .ConfigureAwait(false);

            mustTryMoreResults = response.MoreResultsExist;
            anchorLinkId = response.AnchorId;

            foreach (var childLinkId in response.LinkIds)
            {
                yield return new NodeUid(folderUid.VolumeId, childLinkId);
            }
        }
    }

    public static async ValueTask<FolderNode> CreateAsync(
        ProtonDriveClient client,
        NodeUid parentUid,
        string name,
        DateTimeOffset? lastModificationTime,
        CancellationToken cancellationToken)
    {
        var parentResult = await client.GetNodeAsync(parentUid, cancellationToken).ConfigureAwait(false);
        if (parentResult is null)
        {
            throw new InvalidOperationException("Parent node not found.");
        }

        var parentOwnedBy = parentResult.OwnedBy;

        var (parentKey, parentHashKey) = await GetKeyAndHashKeyAsync(client, parentUid, forPhotos: false, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var hashKey = CryptoGenerator.GenerateFolderHashKey();

        NodeOperations.GetCommonCreationParameters(
            name,
            parentKey,
            parentHashKey.Span,
            signingKey,
            PgpProfile.Proton,
            out var key,
            out var lockedKey,
            out var nameSessionKey,
            out var passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var keyPassphraseSignature);

        var extendedAttributes = new ExtendedAttributes
        {
            Common = new CommonExtendedAttributes
            {
                ModificationTime = lastModificationTime?.UtcDateTime,
            },
        };

        var extendedAttributesUtf8Bytes = JsonSerializer.SerializeToUtf8Bytes(extendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

        var encryptedExtendedAttributes = key.EncryptAndSign(extendedAttributesUtf8Bytes, signingKey, outputCompression: PgpCompression.Default);

        var request = new FolderCreationRequest
        {
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ParentLinkId = parentUid.LinkId,
            Passphrase = encryptedKeyPassphrase,
            PassphraseSignature = keyPassphraseSignature,
            SignatureEmailAddress = membershipAddress.EmailAddress,
            Key = lockedKey,
            HashKey = key.EncryptAndSign(hashKey, key),
            ExtendedAttributes = encryptedExtendedAttributes,
        };

        var response = await client.Api.Folders.CreateFolderAsync(parentUid.VolumeId, request, cancellationToken).ConfigureAwait(false);

        var folderUid = new NodeUid(parentUid.VolumeId, response.FolderId.Value);

        var folderSecrets = new FolderSecrets
        {
            Key = key,
            PassphraseSessionKey = passphraseSessionKey,
            NameSessionKey = nameSessionKey,
            HashKey = hashKey,
        };

        await client.Cache.Secrets.SetFolderSecretsAsync(folderUid, folderSecrets, cancellationToken).ConfigureAwait(false);

        var author = new Author { EmailAddress = membershipAddress.EmailAddress };

        var folderNode = new FolderNode
        {
            Uid = folderUid,
            ParentUid = parentUid,
            Name = name,
            NameAuthor = author,
            Author = author,
            CreationTime = DateTime.UtcNow,
            OwnedBy = parentOwnedBy,
            Errors = [],
        };

        await client.Cache.Entities.SetNodeAsync(folderUid, folderNode, membershipShareId: null, nameHashDigest, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    public static async ValueTask<FolderSecrets> GetSecretsAsync(
        ProtonDriveClient client,
        NodeUid folderUid,
        bool forPhotos,
        CancellationToken cancellationToken)
    {
        var result = await client.Cache.Secrets.TryGetFolderSecretsAsync(folderUid, cancellationToken).ConfigureAwait(false);

        if (result is null)
        {
            var nodeMetadata = await NodeOperations.GetFreshNodeMetadataAsync(client, folderUid, knownShareAndKey: null, forPhotos, cancellationToken)
                .ConfigureAwait(false);

            result = nodeMetadata.GetFolderSecretsOrThrow();
        }

        return result;
    }

    public static async ValueTask<(PgpPrivateKey Key, ReadOnlyMemory<byte> HashKey)> GetKeyAndHashKeyAsync(
        ProtonDriveClient client,
        NodeUid folderUid,
        bool forPhotos,
        CancellationToken cancellationToken)
    {
        var secretsResult = await GetSecretsAsync(client, folderUid, forPhotos, cancellationToken).ConfigureAwait(false);

        var key = secretsResult.Key ?? throw new InvalidOperationException($"Parent folder key not available for {folderUid}");
        var hashKey = secretsResult.HashKey ?? throw new InvalidOperationException($"Parent folder hash key not available for {folderUid}");

        return (key, hashKey);
    }
}
