using System.Security.Cryptography;
using System.Text;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeOperations
{
    public static async ValueTask<FolderNode> GetMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var shareId = await client.Cache.Entities.TryGetMyFilesShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            return await GetFreshMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        var shareAndKey = await ShareOperations.GetShareAsync(client, shareId.Value, cancellationToken).ConfigureAwait(false);

        var node = await GetNodeAsync(client, shareAndKey.Share.RootFolderId, shareAndKey, cancellationToken).ConfigureAwait(false);

        return (FolderNode)node;
    }

    public static async ValueTask<Node> GetNodeAsync(
        ProtonDriveClient client,
        NodeUid nodeId,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var cachedNodeInfo = await client.Cache.Entities.TryGetNodeAsync(nodeId, cancellationToken).ConfigureAwait(false);

        if (cachedNodeInfo is not var (nodeResult, _, _))
        {
            var nodeAndSecretsResult = await GetFreshNodeAndSecretsAsync(client, nodeId, knownShareAndKey, cancellationToken).ConfigureAwait(false);

            nodeResult = nodeAndSecretsResult.ToNodeResult();
        }

        return nodeResult.GetValueOrThrow();
    }

    public static void GetCommonCreationParameters(
        string name,
        PgpPrivateKey parentFolderKey,
        ReadOnlySpan<byte> parentFolderHashKey,
        PgpPrivateKey signingKey,
        out PgpPrivateKey key,
        out PgpSessionKey nameSessionKey,
        out PgpSessionKey passphraseSessionKey,
        out ArraySegment<byte> encryptedName,
        out ArraySegment<byte> nameHashDigest,
        out ArraySegment<byte> encryptedKeyPassphrase,
        out ArraySegment<byte> passphraseSignature,
        out ArraySegment<byte> lockedKeyBytes)
    {
        key = PgpPrivateKey.Generate("Drive key", "no-reply@proton.me", KeyGenerationAlgorithm.Default);
        nameSessionKey = PgpSessionKey.Generate();

        Span<byte> passphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var passphrase = CryptoGenerator.GeneratePassphrase(passphraseBuffer);

        passphraseSessionKey = PgpSessionKey.Generate();
        var passphraseEncryptionSecrets = new EncryptionSecrets(parentFolderKey, passphraseSessionKey);

        encryptedKeyPassphrase = PgpEncrypter.EncryptAndSign(passphrase, passphraseEncryptionSecrets, signingKey, out passphraseSignature);

        using var lockedKey = key.Lock(passphrase);
        lockedKeyBytes = lockedKey.ToBytes();

        GetNameParameters(name, parentFolderKey, parentFolderHashKey, nameSessionKey, signingKey, out encryptedName, out nameHashDigest);
    }

    public static async ValueTask<Result<NodeAndSecrets, DegradedNodeAndSecrets>> GetFreshNodeAndSecretsAsync(
        ProtonDriveClient client,
        NodeUid nodeId,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var response = await client.Api.Links.GetLinkDetailsAsync(nodeId.VolumeId, [nodeId.LinkId], cancellationToken).ConfigureAwait(false);

        var linkDetails = response.Links[0];

        var parentKeyResult = await GetParentKeyAsync(
            client,
            nodeId.VolumeId,
            linkDetails.Link.ParentId,
            knownShareAndKey,
            linkDetails.Membership?.ShareId,
            cancellationToken).ConfigureAwait(false);

        return await NodeCrypto.DecryptNodeAsync(client, nodeId, linkDetails, parentKeyResult, cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<Address> GetMembershipAddressAsync(ProtonDriveClient client, NodeUid nodeUid, CancellationToken cancellationToken)
    {
        // TODO: try to get the information from cache first
        var response = await client.Api.Links.GetContextShareAsync(nodeUid.VolumeId, nodeUid.LinkId, cancellationToken).ConfigureAwait(false);

        var (share, _) = await ShareOperations.GetShareAsync(client, response.ContextShareId, cancellationToken).ConfigureAwait(false);

        return await client.Account.GetAddressAsync(client, share.MembershipAddressId, cancellationToken).ConfigureAwait(false);
    }

    private static async ValueTask<FolderNode> GetFreshMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        ShareVolumeDto volumeDto;
        ShareDto shareDto;
        LinkDetailsDto linkDetailsDto;

        try
        {
            (volumeDto, shareDto, linkDetailsDto) = await client.Api.Shares.GetMyFilesShareAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException e) when (e.Code == ResponseCode.DoesNotExist)
        {
            return await CreateMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        var nodeId = new NodeUid(volumeDto.Id, linkDetailsDto.Link.Id);

        var (share, shareKey) = await ShareCrypto.DecryptShareAsync(
            client,
            shareDto.Id,
            shareDto.Key,
            shareDto.Passphrase,
            shareDto.AddressId,
            nodeId,
            cancellationToken).ConfigureAwait(false);

        var nodeProvisionResult = await NodeCrypto.DecryptNodeAsync(client, nodeId, linkDetailsDto, shareKey, cancellationToken).ConfigureAwait(false);

        var folderNode = nodeProvisionResult.GetFolderNodeOrThrow();

        await client.Cache.Entities.SetMyFilesShareIdAsync(share.Id, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }

    private static async Task<Result<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? childMembershipShareId,
        CancellationToken cancellationToken)
    {
        if (childMembershipShareId is not null && childMembershipShareId == shareAndKeyToUse?.Share.Id)
        {
            return shareAndKeyToUse.Value.Key;
        }

        var currentId = parentId;
        var currentMembershipShareId = childMembershipShareId;

        var linkAncestry = new Stack<LinkDetailsDto>(8);

        PgpPrivateKey? lastKey = null;

        try
        {
            while (currentId is not null)
            {
                if (shareAndKeyToUse is var (shareToUse, shareKeyToUse) && currentId == shareToUse.RootFolderId.LinkId)
                {
                    lastKey = shareKeyToUse;
                    break;
                }

                var folderSecrets = await client.Cache.Secrets.TryGetFolderSecretsAsync(new NodeUid(volumeId, currentId.Value), cancellationToken)
                    .ConfigureAwait(false);

                if (folderSecrets is not null)
                {
                    lastKey = folderSecrets.Key;
                    break;
                }

                var linkDetailsResponse = await client.Api.Links.GetLinkDetailsAsync(volumeId, [currentId.Value], cancellationToken).ConfigureAwait(false);

                var linkDetails = linkDetailsResponse.Links[0];

                linkAncestry.Push(linkDetails);

                var (link, _, _, membership) = linkDetails;

                currentId = link.ParentId;

                currentMembershipShareId = membership?.ShareId;
            }
        }
        catch (Exception e)
        {
            return new ProtonDriveError(e.Message);
        }

        if (lastKey is not { } currentParentKey)
        {
            if (shareAndKeyToUse is not null)
            {
                currentParentKey = shareAndKeyToUse.Value.Key;
            }
            else
            {
                if (currentMembershipShareId is null)
                {
                    return new ProtonDriveError("No membership available to access node");
                }

                (_, currentParentKey) = await ShareOperations.GetShareAsync(client, currentMembershipShareId.Value, cancellationToken).ConfigureAwait(false);
            }
        }

        while (linkAncestry.TryPop(out var ancestorLinkDetails))
        {
            var decryptionResult = await NodeCrypto.DecryptNodeAsync(
                client,
                new NodeUid(volumeId, ancestorLinkDetails.Link.Id),
                ancestorLinkDetails,
                currentParentKey,
                cancellationToken).ConfigureAwait(false);

            if (!decryptionResult.TryGetFolderKeyElseError(out var folderKey, out var error))
            {
                // TODO: wrap error for more context?
                return error;
            }

            currentParentKey = folderKey.Value;
        }

        return currentParentKey;
    }

    private static void GetNameParameters(
        string name,
        PgpPrivateKey parentFolderKey,
        ReadOnlySpan<byte> parentFolderHashKey,
        PgpSessionKey nameSessionKey,
        PgpPrivateKey signingKey,
        out ArraySegment<byte> encryptedName,
        out ArraySegment<byte> nameHashDigest)
    {
        var maxNameByteLength = Encoding.UTF8.GetByteCount(name);
        var nameBytes = MemoryProvider.GetHeapMemoryIfTooLargeForStack<byte>(maxNameByteLength, out var nameHeapMemoryOwner)
            ? nameHeapMemoryOwner.Memory.Span
            : stackalloc byte[maxNameByteLength];

        using (nameHeapMemoryOwner)
        {
            var nameByteLength = Encoding.UTF8.GetBytes(name, nameBytes);
            nameBytes = nameBytes[..nameByteLength];

            encryptedName = PgpEncrypter.EncryptAndSignText(name, new EncryptionSecrets(parentFolderKey, nameSessionKey), signingKey);

            nameHashDigest = HMACSHA256.HashData(parentFolderHashKey, nameBytes);
        }
    }

    private static async ValueTask<FolderNode> CreateMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (_, _, folderNode) = await VolumeOperations.CreateVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }
}
