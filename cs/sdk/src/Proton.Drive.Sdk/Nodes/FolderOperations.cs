using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class FolderOperations
{
    public static async IAsyncEnumerable<Result<Node, DegradedNode>> EnumerateChildrenAsync(
        ProtonDriveClient client,
        NodeUid folderUid,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorLinkId = default(LinkId?);
        var mustTryMoreResults = true;

        var folderSecrets = await GetSecretsAsync(client, folderUid, cancellationToken).ConfigureAwait(false);

        var batchLoader = new FolderChildrenBatchLoader(client, folderUid.VolumeId, folderSecrets.Key);

        while (mustTryMoreResults)
        {
            var response = await client.Api.Folders.GetChildrenAsync(folderUid.VolumeId, folderUid.LinkId, anchorLinkId, cancellationToken)
                .ConfigureAwait(false);

            mustTryMoreResults = response.MoreResultsExist;
            anchorLinkId = response.AnchorId;

            foreach (var childLinkId in response.LinkIds)
            {
                var childUid = new NodeUid(folderUid.VolumeId, childLinkId);

                var cachedChildNodeInfo = await client.Cache.Entities.TryGetNodeAsync(childUid, cancellationToken).ConfigureAwait(false);

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

    public static async ValueTask<FolderNode> CreateAsync(ProtonDriveClient client, NodeUid parentUid, string name, CancellationToken cancellationToken)
    {
        var parentSecrets = await GetSecretsAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

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

        var request = new FolderCreationRequest
        {
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ParentLinkId = parentUid.LinkId,
            Passphrase = encryptedKeyPassphrase,
            PassphraseSignature = keyPassphraseSignature,
            SignatureEmailAddress = membershipAddress.EmailAddress,
            Key = armoredKey,
            HashKey = key.EncryptAndSign(hashKey, key),
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
        };

        await client.Cache.Entities.SetNodeAsync(folderUid, folderNode, membershipShareId: null, nameHashDigest, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    public static async ValueTask<FolderSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid folderUid, CancellationToken cancellationToken)
    {
        var folderSecretsResult = await client.Cache.Secrets.TryGetFolderSecretsAsync(folderUid, cancellationToken).ConfigureAwait(false);

        var folderSecrets = folderSecretsResult?.GetValueOrDefault();

        if (folderSecrets is null)
        {
            var nodeProvisionResult = await NodeOperations.GetFreshNodeMetadataAsync(client, folderUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            folderSecrets = nodeProvisionResult.GetFolderSecretsOrThrow();
        }

        return folderSecrets;
    }
}
