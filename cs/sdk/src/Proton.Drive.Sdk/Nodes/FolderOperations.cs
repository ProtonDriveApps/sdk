using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Shares;
using Proton.Sdk;
using Proton.Sdk.Addresses;

namespace Proton.Drive.Sdk.Nodes;

internal static class FolderOperations
{
    public static async IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateFolderChildrenAsync(
        ProtonDriveClient client,
        NodeUid folderId,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorId = default(LinkId?);
        var mustTryMoreResults = true;

        var folderSecrets = await GetSecretsAsync(client, folderId, cancellationToken).ConfigureAwait(false);

        var batchLoader = new FolderChildrenBatchLoader(client, folderId.VolumeId, folderSecrets.Key);

        while (mustTryMoreResults)
        {
            var response = await client.Api.Folders.GetChildrenAsync(folderId.VolumeId, folderId.LinkId, anchorId, cancellationToken).ConfigureAwait(false);

            mustTryMoreResults = response.MoreResultsExist;
            anchorId = response.AnchorId;

            foreach (var childLinkId in response.LinkIds)
            {
                var childId = new NodeUid(folderId.VolumeId, childLinkId);

                var cachedChildNodeInfo = await client.Cache.Entities.TryGetNodeAsync(childId, cancellationToken).ConfigureAwait(false);

                if (cachedChildNodeInfo is null)
                {
                    foreach (var nodeResult in await batchLoader.QueueAndTryLoadBatchAsync(childLinkId, cancellationToken).ConfigureAwait(false))
                    {
                        yield return nodeResult;
                    }
                }
                else
                {
                    yield return cachedChildNodeInfo.Value.NodeProvisionResult;
                }
            }
        }

        foreach (var node in await batchLoader.LoadRemainingAsync(cancellationToken).ConfigureAwait(false))
        {
            yield return node;
        }
    }

    public static async ValueTask<FolderNode> CreateFolderAsync(ProtonDriveClient client, NodeUid parentId, string name, CancellationToken cancellationToken)
    {
        var parentSecrets = await GetSecretsAsync(client, parentId, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await GetMembershipAddressAsync(client, parentId, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var hashKey = RandomNumberGenerator.GetBytes(32);

        NodeOperations.GetCommonCreationParameters(
            name,
            parentSecrets.Key,
            parentSecrets.HashKey.Span,
            signingKey,
            out var key,
            out var nameSessionKey,
            out var passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var keyPassphraseSignature,
            out var armoredKey);

        var parameters = new FolderCreationParameters
        {
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ParentLinkId = parentId.LinkId,
            Passphrase = encryptedKeyPassphrase,
            PassphraseSignature = keyPassphraseSignature,
            SignatureEmailAddress = membershipAddress.EmailAddress,
            Key = armoredKey,
            HashKey = key.EncryptAndSign(hashKey, key),
        };

        var response = await client.Api.Folders.CreateFolderAsync(parentId.VolumeId, parameters, cancellationToken).ConfigureAwait(false);

        var folderId = new NodeUid(parentId.VolumeId, response.FolderId.Value);

        var folderSecrets = new FolderSecrets
        {
            Key = key,
            PassphraseSessionKey = passphraseSessionKey,
            NameSessionKey = nameSessionKey,
            HashKey = hashKey,
        };

        await client.Cache.Secrets.SetFolderSecretsAsync(folderId, folderSecrets, cancellationToken).ConfigureAwait(false);

        var author = new Author { EmailAddress = membershipAddress.EmailAddress };

        var folderNode = new FolderNode
        {
            Id = folderId,
            ParentId = parentId,
            Name = name,
            IsTrashed = false,
            NameAuthor = author,
            Author = author,
        };

        await client.Cache.Entities.SetNodeAsync(folderId, folderNode, membershipShareId: null, nameHashDigest, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    internal static async ValueTask<FolderSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid folderId, CancellationToken cancellationToken)
    {
        var folderSecrets = await client.Cache.Secrets.TryGetFolderSecretsAsync(folderId, cancellationToken).ConfigureAwait(false);

        if (folderSecrets is null)
        {
            var nodeProvisionResult = await NodeOperations.GetFreshNodeAndSecretsAsync(client, folderId, knownShareAndKey: null, cancellationToken).ConfigureAwait(false);

            folderSecrets = nodeProvisionResult.GetFolderSecretsOrThrow();
        }

        return folderSecrets;
    }

    private static async ValueTask<Address> GetMembershipAddressAsync(ProtonDriveClient client, NodeUid parentId, CancellationToken cancellationToken)
    {
        // TODO: try to get the information from cache first
        var response = await client.Api.Links.GetContextShareAsync(parentId.VolumeId, parentId.LinkId, cancellationToken).ConfigureAwait(false);

        var (share, _) = await ShareOperations.GetShareAsync(client, response.ContextShareId, cancellationToken).ConfigureAwait(false);

        return await client.Account.GetAddressAsync(client, share.MembershipAddressId, cancellationToken).ConfigureAwait(false);
    }
}
