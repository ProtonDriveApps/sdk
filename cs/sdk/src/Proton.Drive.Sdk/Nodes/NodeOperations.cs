using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeOperations
{
    private const int MaximumBatchCount = 150;

    public static async ValueTask<FolderNode> GetMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var shareId = await client.Cache.Entities.TryGetMyFilesShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            return await GetFreshMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
        }

        var shareAndKey = await ShareOperations.GetShareAsync(client, shareId.Value, cancellationToken).ConfigureAwait(false);

        var metadata = await GetNodeMetadataAsync(client, shareAndKey.Share.RootFolderId, shareAndKey, cancellationToken).ConfigureAwait(false);

        return (FolderNode)metadata.Node;
    }

    public static ValueTask<NodeMetadata> GetNodeMetadataAsync(ProtonDriveClient client, NodeUid uid, CancellationToken cancellationToken)
    {
        return GetNodeMetadataAsync(client, uid, knownShareAndKey: null, cancellationToken);
    }

    public static async ValueTask<NodeMetadata> GetNodeMetadataAsync(
        ProtonDriveClient client,
        NodeUid uid,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var cachedNodeInfo = await client.Cache.Entities.TryGetNodeAsync(uid, cancellationToken).ConfigureAwait(false);

        var metadataResult = cachedNodeInfo is not null
            ? await GetNodeMetadataAsync(client, uid, cachedNodeInfo.Value, cancellationToken).ConfigureAwait(false)
            : null;

        metadataResult ??= await GetFreshNodeMetadataAsync(client, uid, knownShareAndKey, cancellationToken).ConfigureAwait(false);

        return metadataResult.Value.GetValueOrThrow();
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

    public static async ValueTask<Result<NodeMetadata, DegradedNodeMetadata>> GetFreshNodeMetadataAsync(
        ProtonDriveClient client,
        NodeUid uid,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var response = await client.Api.Links.GetDetailsAsync(uid.VolumeId, [uid.LinkId], cancellationToken).ConfigureAwait(false);

        return await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(client, uid.VolumeId, response.Links[0], knownShareAndKey, cancellationToken)
            .ConfigureAwait(false);
    }

    public static async ValueTask MoveSingleAsync(
        ProtonDriveClient client,
        NodeUid uid,
        NodeUid newParentUid,
        string? newName,
        CancellationToken cancellationToken)
    {
        // FIXME: try to get the information from cache first
        var membershipAddress = await GetMembershipAddressAsync(client, newParentUid, cancellationToken).ConfigureAwait(false);

        using var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var destinationFolderSecrets = await FolderOperations.GetSecretsAsync(client, newParentUid, cancellationToken).ConfigureAwait(false);

        if (uid == newParentUid)
        {
            throw new InvalidOperationException($"Node {uid} cannot be moved onto itself");
        }

        if (uid.VolumeId != newParentUid.VolumeId)
        {
            throw new InvalidOperationException($"Node {uid} cannot have destination node {newParentUid} as parent as they are not on the same volume");
        }

        var (originNode, originSecrets, membershipShareId, originNameHashDigest) = await GetNodeMetadataAsync(client, uid, null, cancellationToken)
            .ConfigureAwait(false);

        GetNameParameters(
            newName ?? originNode.Name, // FIXME: validate name
            destinationFolderSecrets.Key,
            destinationFolderSecrets.HashKey.Span,
            originSecrets.NameSessionKey,
            signingKey,
            out var encryptedName,
            out var nameHashDigest);

        var passphraseKeyPacket = destinationFolderSecrets.Key.EncryptSessionKey(originSecrets.PassphraseSessionKey);

        ReadOnlyMemory<byte>? passphraseSignature = null;
        string? signatureEmailAddress = null;

        if (originSecrets.PassphraseForAnonymousMove is not null)
        {
            passphraseSignature = signingKey.Sign(originSecrets.PassphraseForAnonymousMove.Value.Span);
            signatureEmailAddress = membershipAddress.EmailAddress;
        }

        var request = new MoveSingleLinkRequest
        {
            Name = encryptedName,
            Passphrase = passphraseKeyPacket,
            NameHashDigest = nameHashDigest,
            ParentLinkId = newParentUid.LinkId,
            OriginalNameHashDigest = originNameHashDigest,
            NameSignatureEmailAddress = membershipAddress.EmailAddress,
            PassphraseSignature = passphraseSignature,
            SignatureEmailAddress = signatureEmailAddress,
        };

        await client.Api.Links.MoveAsync(newParentUid.VolumeId, uid.LinkId, request, cancellationToken).ConfigureAwait(false);

        var newNode = originNode with { ParentUid = newParentUid, Name = newName ?? originNode.Name };

        await client.Cache.Entities.SetNodeAsync(uid, newNode, membershipShareId, nameHashDigest, cancellationToken).ConfigureAwait(false);
    }

    // For future use
    public static async Task MoveMultipleAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> uids,
        NodeUid newParentUid,
        string? newName,
        CancellationToken cancellationToken)
    {
        // FIXME: try to get the information from cache first
        var membershipAddress = await GetMembershipAddressAsync(client, newParentUid, cancellationToken).ConfigureAwait(false);

        using var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var destinationFolderSecrets = await FolderOperations.GetSecretsAsync(client, newParentUid, cancellationToken).ConfigureAwait(false);

        var batch = new List<MoveMultipleLinksItem>();

        foreach (var uid in uids)
        {
            if (uid.VolumeId != newParentUid.VolumeId)
            {
                throw new InvalidOperationException($"Node {uid} cannot have destination node {newParentUid} as parent as they are not on the same volume");
            }

            var (originNode, originSecrets, _, originNameHashDigest) = await GetNodeMetadataAsync(client, uid, null, cancellationToken)
                .ConfigureAwait(false);

            GetNameParameters(
                newName ?? originNode.Name, // FIXME: validate name
                destinationFolderSecrets.Key,
                destinationFolderSecrets.HashKey.Span,
                originSecrets.NameSessionKey,
                signingKey,
                out var encryptedName,
                out var nameHashDigest);

            var passphraseKeyPacket = destinationFolderSecrets.Key.EncryptSessionKey(originSecrets.PassphraseSessionKey);

            var itemRequest = new MoveMultipleLinksItem
            {
                LinkId = uid.LinkId,
                Passphrase = passphraseKeyPacket,
                Name = encryptedName,
                NameHashDigest = nameHashDigest,
                OriginalNameHashDigest = originNameHashDigest,
                PassphraseSignature = null, // FIXME: sign with parent node key if anonymously-uploaded file
            };

            batch.Add(itemRequest);
        }

        var batchRequest = new MoveMultipleLinksRequest
        {
            ParentLinkId = newParentUid.LinkId,
            Batch = batch,
            NameSignatureEmailAddress = membershipAddress.EmailAddress,
            SignatureEmailAddress = null, // FIXME: specify for anonymously-uploaded files
        };

        await client.Api.Links.MoveMultipleAsync(newParentUid.VolumeId, batchRequest, cancellationToken).ConfigureAwait(false);

        // FIXME: update cache
    }

    public static async ValueTask RenameAsync(
        ProtonDriveClient client,
        NodeUid uid,
        string newName,
        string? newMediaType,
        CancellationToken cancellationToken)
    {
        // TODO: support renaming degraded nodes
        var (node, secrets, membershipShareId, originalNameHashDigest) = await GetNodeMetadataAsync(client, uid, cancellationToken).ConfigureAwait(false);

        if (node.ParentUid is not { } parentUid)
        {
            throw new InvalidOperationException("Cannot rename root node");
        }

        var membershipAddress = await GetMembershipAddressAsync(client, uid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var parentFolderSecrets = await FolderOperations.GetSecretsAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

        GetNameParameters(
            newName, // FIXME: validate name
            parentFolderSecrets.Key,
            parentFolderSecrets.HashKey.Span,
            secrets.NameSessionKey,
            signingKey,
            out var encryptedName,
            out var nameHashDigest);

        var parameters = new RenameLinkRequest
        {
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            NameSignatureEmailAddress = membershipAddress.EmailAddress,
            MediaType = newMediaType,
            OriginalNameHashDigest = originalNameHashDigest,
        };

        await client.Api.Links.RenameAsync(uid.VolumeId, uid.LinkId, parameters, cancellationToken).ConfigureAwait(false);

        await client.Cache.Entities.SetNodeAsync(uid, node with { Name = newName }, membershipShareId, nameHashDigest, cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<string?>>> TrashAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> uids,
        CancellationToken cancellationToken)
    {
        var uidsByVolumeId = uids.GroupBy(x => x.VolumeId);

        var results = new ConcurrentDictionary<NodeUid, Result<string?>>();

        var tasks = uidsByVolumeId.Select(async uidGroup =>
        {
            foreach (var batch in uidGroup.Select(x => x.LinkId).Chunk(MaximumBatchCount))
            {
                var request = new MultipleLinksNullaryRequest { LinkIds = batch };

                var aggregateResponse = await client.Api.Trash.TrashMultipleAsync(uidGroup.Key, request, cancellationToken).ConfigureAwait(false);

                foreach (var (linkId, response) in aggregateResponse.Responses)
                {
                    var uid = new NodeUid(uidGroup.Key, linkId);

                    var cachedNodeInfo = await client.Cache.Entities.TryGetNodeAsync(uid, cancellationToken).ConfigureAwait(false);

                    if (cachedNodeInfo is var (nodeProvisionResult, membershipShareId, nameHashDigest))
                    {
                        // TODO: have the back-end return the trash time so that the cached value be exactly the same
                        var newNodeProvisionResult = nodeProvisionResult.Convert(
                            node => node with { TrashTime = DateTime.UtcNow },
                            degradedNode => degradedNode with { TrashTime = DateTime.UtcNow });

                        await client.Cache.Entities.SetNodeAsync(uid, newNodeProvisionResult, membershipShareId, nameHashDigest, cancellationToken)
                            .ConfigureAwait(false);
                    }

                    var result = response.IsSuccess ? Result<string?>.Success : response.ErrorMessage;

                    results.TryAdd(uid, result);
                }
            }
        });

        await Task.WhenAll(tasks).ConfigureAwait(false);

        return results;
    }

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> uids,
        CancellationToken cancellationToken)
    {
        var uidsByVolumeId = uids.GroupBy(x => x.VolumeId);

        var results = new ConcurrentDictionary<NodeUid, Result<Exception>>();

        var tasks = uidsByVolumeId.Select(async uidGroup =>
        {
            foreach (var batch in uidGroup.Select(x => x.LinkId).Chunk(MaximumBatchCount))
            {
                var request = new MultipleLinksNullaryRequest { LinkIds = batch };

                var aggregateResponse = await client.Api.Links.DeleteMultipleAsync(uidGroup.Key, request, cancellationToken).ConfigureAwait(false);

                foreach (var (linkId, response) in aggregateResponse.Responses)
                {
                    var uid = new NodeUid(uidGroup.Key, linkId);

                    var result = response.IsSuccess ? Result<Exception>.Success : new ProtonApiException(response);

                    results.TryAdd(uid, result);
                }
            }
        });

        await Task.WhenAll(tasks).ConfigureAwait(false);

        return results;
    }

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<string?>>> RestoreAsync(
        ProtonDriveClient client,
        IEnumerable<NodeUid> uids,
        CancellationToken cancellationToken)
    {
        var uidsByVolumeId = uids.GroupBy(x => x.VolumeId);

        var results = new ConcurrentDictionary<NodeUid, Result<string?>>();

        var tasks = uidsByVolumeId.Select(async uidGroup =>
        {
            foreach (var batch in uidGroup.Select(x => x.LinkId).Chunk(MaximumBatchCount))
            {
                var request = new MultipleLinksNullaryRequest { LinkIds = batch };

                var aggregateResponse = await client.Api.Trash.RestoreMultipleAsync(uidGroup.Key, request, cancellationToken).ConfigureAwait(false);

                foreach (var (linkId, response) in aggregateResponse.Responses)
                {
                    var uid = new NodeUid(uidGroup.Key, linkId);

                    var result = response.IsSuccess ? Result<string?>.Success : response.ErrorMessage;

                    results.TryAdd(uid, result);
                }
            }
        });

        await Task.WhenAll(tasks).ConfigureAwait(false);

        // FIXME: remove trash time from cache
        return results;
    }

    public static async ValueTask<string> GetAvailableNameAsync(ProtonDriveClient client, NodeUid parentUid, string name, CancellationToken cancellationToken)
    {
        const int batchSize = 10;

        var folderSecrets = await FolderOperations.GetSecretsAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

        var digestsToNamesMap = new Dictionary<string, string>(batchSize);

        using var batchEnumerator = client.GetAlternateFileNames.Invoke(name).Prepend(name).Chunk(10).GetEnumerator();

        string? availableName = null;

        while (availableName is null)
        {
            digestsToNamesMap.Clear();

            batchEnumerator.MoveNext();

            foreach (var candidateName in batchEnumerator.Current)
            {
                var digest = Convert.ToHexStringLower(NodeCrypto.HashNodeName(candidateName, folderSecrets.HashKey.Span));
                digestsToNamesMap[digest] = candidateName;
            }

            var nameAvailabilityRequest = new NodeNameAvailabilityRequest { ClientUid = [client.Uid], NameHashDigests = digestsToNamesMap.Keys };

            var response = await client.Api.Links.GetAvailableNames(parentUid.VolumeId, parentUid.LinkId, nameAvailabilityRequest, cancellationToken)
                .ConfigureAwait(false);

            if (response.AvailableNameHashDigests.Count == 0)
            {
                continue;
            }

            if (!digestsToNamesMap.TryGetValue(response.AvailableNameHashDigests[0], out availableName))
            {
                throw new KeyNotFoundException("Unknown name hash digest received");
            }
        }

        return availableName;
    }

    public static async ValueTask<Address> GetMembershipAddressAsync(ProtonDriveClient client, NodeUid nodeUid, CancellationToken cancellationToken)
    {
        // FIXME: try to get the information from cache first
        var response = await client.Api.Links.GetContextShareAsync(nodeUid.VolumeId, nodeUid.LinkId, cancellationToken).ConfigureAwait(false);

        var (share, _) = await ShareOperations.GetShareAsync(client, response.ContextShareId, cancellationToken).ConfigureAwait(false);

        return await client.Account.GetAddressAsync(share.MembershipAddressId, cancellationToken).ConfigureAwait(false);
    }

    public static bool ValidateName(
        Result<PhasedDecryptionOutput<string>, string> decryptionResult,
        [NotNullWhen(true)] out PhasedDecryptionOutput<string>? nameOutput,
        out Result<string, ProtonDriveError> nameResult,
        [NotNullWhen(true)] out PgpSessionKey? sessionKey)
    {
        if (!decryptionResult.TryGetValueElseError(out var nameOutputValue, out var decryptionErrorMessage))
        {
            nameOutput = null;
            nameResult = new DecryptionError(decryptionErrorMessage);
            sessionKey = null;
            return false;
        }

        nameOutput = nameOutputValue;
        sessionKey = nameOutputValue.SessionKey;

        var name = nameOutputValue.Data;

        if (string.IsNullOrEmpty(name))
        {
            nameResult = new InvalidNameError(name, "Name must not be empty");
            return false;
        }

        if (name.Contains('/'))
        {
            nameResult = new InvalidNameError(name, "Name must not contain the character '/'");
            return false;
        }

        nameResult = name;
        return true;
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

        await client.Cache.Entities.SetMyFilesShareIdAsync(shareDto.Id, cancellationToken).ConfigureAwait(false);

        var nodeUid = new NodeUid(volumeDto.Id, linkDetailsDto.Link.Id);

        var (share, shareKey) = await ShareCrypto.DecryptShareAsync(
            client,
            shareDto.Id,
            shareDto.Key,
            shareDto.Passphrase,
            shareDto.AddressId,
            nodeUid,
            cancellationToken).ConfigureAwait(false);

        await client.Cache.Secrets.SetShareKeyAsync(share.Id, shareKey, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);

        var metadataResult = await DtoToMetadataConverter.ConvertDtoToFolderMetadataAsync(client, volumeDto.Id, linkDetailsDto, shareKey, cancellationToken)
            .ConfigureAwait(false);

        return metadataResult.GetValueOrThrow().Node;
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

    private static async ValueTask<Result<NodeMetadata, DegradedNodeMetadata>?> GetNodeMetadataAsync(
        ProtonDriveClient client,
        NodeUid uid,
        CachedNodeInfo cachedNodeInfo,
        CancellationToken cancellationToken)
    {
        if (!cachedNodeInfo.NodeProvisionResult.TryGetValueElseError(out var node, out var degradedNode))
        {
            switch (degradedNode)
            {
                case DegradedFolderNode degradedFolderNode:
                    var folderSecretsResult = await client.Cache.Secrets.TryGetFolderSecretsAsync(uid, cancellationToken).ConfigureAwait(false);

                    return folderSecretsResult is not null && folderSecretsResult.Value.TryGetError(out var degradedFolderSecrets)
                        ? new DegradedNodeMetadata(degradedFolderNode, degradedFolderSecrets, cachedNodeInfo.MembershipShareId, cachedNodeInfo.NameHashDigest)
                        : (Result<NodeMetadata, DegradedNodeMetadata>?)null;

                case DegradedFileNode degradedFileNode:
                    var fileSecretsResult = await client.Cache.Secrets.TryGetFileSecretsAsync(uid, cancellationToken).ConfigureAwait(false);

                    return fileSecretsResult is not null && fileSecretsResult.Value.TryGetError(out var degradedFileSecrets)
                        ? new DegradedNodeMetadata(degradedFileNode, degradedFileSecrets, cachedNodeInfo.MembershipShareId, cachedNodeInfo.NameHashDigest)
                        : (Result<NodeMetadata, DegradedNodeMetadata>?)null;

                default:
                    throw new InvalidOperationException($"Degraded node type \"{node?.GetType().Name}\" is not supported");
            }
        }

        switch (node)
        {
            case FolderNode folderNode:
                var folderSecretsResult = await client.Cache.Secrets.TryGetFolderSecretsAsync(uid, cancellationToken).ConfigureAwait(false);

                return folderSecretsResult is not null && folderSecretsResult.Value.TryGetValue(out var folderSecrets)
                    ? new NodeMetadata(folderNode, folderSecrets, cachedNodeInfo.MembershipShareId, cachedNodeInfo.NameHashDigest)
                    : null;

            case FileNode fileNode:
                var fileSecretsResult = await client.Cache.Secrets.TryGetFileSecretsAsync(uid, cancellationToken).ConfigureAwait(false);

                return fileSecretsResult is not null && fileSecretsResult.Value.TryGetValue(out var fileSecrets)
                    ? new NodeMetadata(fileNode, fileSecrets, cachedNodeInfo.MembershipShareId, cachedNodeInfo.NameHashDigest)
                    : null;

            default:
                throw new InvalidOperationException($"Node type \"{node.GetType().Name}\" is not supported");
        }
    }

    private static async ValueTask<FolderNode> CreateMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (_, _, folderNode) = await VolumeOperations.CreateVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }
}
