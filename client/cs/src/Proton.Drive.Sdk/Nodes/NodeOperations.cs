using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Account.Addresses;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Cryptography;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeOperations
{
    private const int MaximumBatchCount = 150;
    private const int MaxNodeNameLength = 255;

    public static async ValueTask<FolderNode> GetOrCreateMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var existingFolder = await TryGetExistingMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);

        return existingFolder ?? await CreateMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<FolderNode?> TryGetExistingMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var shareId = await client.Cache.Entities.TryGetMyFilesShareIdAsync(cancellationToken).ConfigureAwait(false);
        if (shareId is null)
        {
            try
            {
                return await GetFreshExistingMyFilesFolderAsync(client, cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException e) when (e.Code is DriveApiResponseCodes.DoesNotExist)
            {
                await client.Cache.Entities.SetMainVolumeIdAsync(null, cancellationToken).AsTask().ConfigureAwait(false);
                return null;
            }
        }

        var shareAndKey = await ShareOperations.GetShareAsync(client, shareId.Value, useCacheOnly: false, cancellationToken).ConfigureAwait(false);

        var metadata = await GetNodeMetadataAsync(client, shareAndKey.Share.RootFolderId, shareAndKey, useCacheOnly: false, forPhotos: false, cancellationToken)
            .ConfigureAwait(false);

        return metadata.GetFolderNodeOrThrow();
    }

    public static async ValueTask<NodeMetadata> GetNodeMetadataAsync(
        ProtonDriveClient client,
        NodeUid uid,
        ShareAndKey? knownShareAndKey,
        bool useCacheOnly,
        bool forPhotos,
        CancellationToken cancellationToken)
    {
        var metadataResult = await TryGetNodeMetadataFromCacheAsync(client, uid, cancellationToken).ConfigureAwait(false);

        if (metadataResult is null)
        {
            if (useCacheOnly)
            {
                throw new NodeNotFoundException(uid);
            }

            metadataResult = await GetFreshNodeMetadataAsync(client, uid, knownShareAndKey, forPhotos, cancellationToken).ConfigureAwait(false);
        }

        return metadataResult.Value;
    }

    public static IAsyncEnumerable<Node> EnumerateNodesAsync(
        ProtonDriveClient client,
        IAsyncEnumerable<NodeUid> nodeUids,
        bool forPhotos,
        CancellationToken cancellationToken = default)
    {
        // TODO: replace grouping with something that does not require enumerating everything first
        return nodeUids.GroupBy(uid => uid.VolumeId, uid => uid.LinkId)
            .SelectMany(linkGroup => EnumerateNodesAsync(client, linkGroup.Key, linkGroup, forPhotos, cancellationToken));
    }

    public static async IAsyncEnumerable<Node> EnumerateNodesAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        IEnumerable<LinkId> linkIds,
        bool forPhotos,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var batchLoader = new NodeBatchLoader(client, volumeId, forPhotos);

        foreach (var linkId in linkIds)
        {
            var cachedChildNodeInfo = await client.Cache.Entities.TryGetNodeAsync(new NodeUid(volumeId, linkId), cancellationToken).ConfigureAwait(false);

            if (cachedChildNodeInfo is not { Node: { } node })
            {
                await foreach (var nodeResult in batchLoader.QueueAndTryLoadBatchAsync(linkId, cancellationToken).ConfigureAwait(false))
                {
                    yield return nodeResult;
                }

                continue;
            }

            yield return node;
        }

        await foreach (var nodeResult in batchLoader.LoadRemainingAsync(cancellationToken).ConfigureAwait(false))
        {
            yield return nodeResult;
        }
    }

    public static void GetCommonCreationParameters(
        string name,
        PgpPrivateKey parentFolderKey,
        ReadOnlySpan<byte> parentFolderHashKey,
        PgpPrivateKey signingKey,
        PgpProfile pgpProfile,
        out PgpPrivateKey key,
        out PgpSecretKey lockedKey,
        out PgpSessionKey nameSessionKey,
        out PgpSessionKey passphraseSessionKey,
        out ArraySegment<byte> encryptedName,
        out ArraySegment<byte> nameHashDigest,
        out ArraySegment<byte> encryptedKeyPassphrase,
        out ArraySegment<byte> passphraseSignature)
    {
        key = PgpPrivateKey.Generate("Drive key", "no-reply@proton.me", KeyGenerationAlgorithm.Default, pgpProfile);
        nameSessionKey = PgpSessionKey.Generate();

        Span<byte> passphraseBuffer = stackalloc byte[CryptoGenerator.PassphraseBufferRequiredLength];
        var passphrase = CryptoGenerator.GeneratePassphrase(passphraseBuffer);

        passphraseSessionKey = PgpSessionKey.Generate();
        var passphraseEncryptionSecrets = new EncryptionSecrets(parentFolderKey, passphraseSessionKey);

        encryptedKeyPassphrase = PgpEncrypter.EncryptAndSign(passphrase, passphraseEncryptionSecrets, signingKey, out passphraseSignature);

        lockedKey = key.Lock(passphrase);

        GetNameParameters(name, parentFolderKey, parentFolderHashKey, nameSessionKey, signingKey, out encryptedName, out nameHashDigest);
    }

    public static async ValueTask<NodeMetadata> GetFreshNodeMetadataAsync(
        ProtonDriveClient client,
        NodeUid uid,
        ShareAndKey? knownShareAndKey,
        bool forPhotos,
        CancellationToken cancellationToken)
    {
        var response = await client.Api.GetLinkDetailsAsync(uid.VolumeId, [uid.LinkId], forPhotos, cancellationToken).ConfigureAwait(false);

        return await DtoToMetadataConverter.ConvertDtoToNodeMetadataAsync(
            client,
            uid.VolumeId,
            response.Links is { Count: > 0 } links ? links[0] : throw new NodeNotFoundException(uid),
            knownShareAndKey,
            cancellationToken)
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

        var destinationFolderSecrets = await FolderOperations.GetSecretsAsync(client, newParentUid, forPhotos: false, cancellationToken).ConfigureAwait(false);

        var destinationKey = destinationFolderSecrets.Key
            ?? throw new InvalidOperationException($"Destination folder key not available for {newParentUid}");

        var destinationHashKey = destinationFolderSecrets.HashKey
            ?? throw new InvalidOperationException($"Destination folder hash key not available for {newParentUid}");

        if (uid == newParentUid)
        {
            throw new InvalidOperationException($"Node {uid} cannot be moved onto itself");
        }

        if (uid.VolumeId != newParentUid.VolumeId)
        {
            throw new InvalidOperationException($"Node {uid} cannot have destination node {newParentUid} as parent as they are not on the same volume");
        }

        var originMetadata = await GetNodeMetadataAsync(client, uid, knownShareAndKey: null, useCacheOnly: false, forPhotos: false, cancellationToken)
            .ConfigureAwait(false);

        var (originNode, originSecrets, membershipShareId, originNameHashDigest) = originMetadata;

        var originName = originNode.Name.GetValueOrThrow();

        var originNameSessionKey = originSecrets.NameSessionKey
            ?? throw new InvalidOperationException($"Name session key not available for {uid}");

        var originPassphraseSessionKey = originSecrets.PassphraseSessionKey
            ?? throw new InvalidOperationException($"Passphrase session key not available for {uid}");

        GetNameParameters(
            newName ?? originName, // FIXME: validate name
            destinationKey,
            destinationHashKey.Span,
            originNameSessionKey,
            signingKey,
            out var encryptedName,
            out var nameHashDigest);

        var passphraseKeyPacket = destinationKey.EncryptSessionKey(originPassphraseSessionKey);

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

        var newNode = originNode with { ParentUid = newParentUid, Name = newName ?? originName };

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

        var destinationFolderSecrets = await FolderOperations.GetSecretsAsync(client, newParentUid, forPhotos: false, cancellationToken).ConfigureAwait(false);

        var destinationKey = destinationFolderSecrets.Key
            ?? throw new InvalidOperationException($"Destination folder key not available for {newParentUid}");

        var destinationHashKey = destinationFolderSecrets.HashKey
            ?? throw new InvalidOperationException($"Destination folder hash key not available for {newParentUid}");

        var batch = new List<MoveMultipleLinksItem>();

        foreach (var uid in uids)
        {
            if (uid.VolumeId != newParentUid.VolumeId)
            {
                throw new InvalidOperationException($"Node {uid} cannot have destination node {newParentUid} as parent as they are not on the same volume");
            }

            // FIXME: Try to use the degraded node if it has enough for the move to be successful
            var (originNode, originSecrets, _, originNameHashDigest) =
                await GetNodeMetadataAsync(client, uid, knownShareAndKey: null, useCacheOnly: false, forPhotos: false, cancellationToken).ConfigureAwait(false);

            var originName = originNode.Name.GetValueOrThrow();

            var originNameSessionKey = originSecrets.NameSessionKey
                ?? throw new InvalidOperationException($"Name session key not available for {uid}");

            var originPassphraseSessionKey = originSecrets.PassphraseSessionKey
                ?? throw new InvalidOperationException($"Passphrase session key not available for {uid}");

            GetNameParameters(
                newName ?? originName, // FIXME: validate name
                destinationKey,
                destinationHashKey.Span,
                originNameSessionKey,
                signingKey,
                out var encryptedName,
                out var nameHashDigest);

            var passphraseKeyPacket = destinationKey.EncryptSessionKey(originPassphraseSessionKey);

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
        // FIXME: Try to use the degraded node if it has enough for the move to be successful
        var nodeMetadata =
            await GetNodeMetadataAsync(client, uid, knownShareAndKey: null, useCacheOnly: false, forPhotos: false, cancellationToken).ConfigureAwait(false);

        var (node, secrets, membershipShareId, originalNameHashDigest) = nodeMetadata;

        // Root nodes are renamed differently (their name is encrypted with the context share key and is not hashed).
        // Such renames belong to the owning feature (e.g. devices), not to the generic node rename path.
        if (node.ParentUid is not { } parentUid)
        {
            throw new InvalidOperationException("Cannot rename root node");
        }

        var membershipAddress = await GetMembershipAddressAsync(client, uid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var nameSessionKey = secrets.NameSessionKey
            ?? throw new InvalidOperationException($"Name session key not available for {uid}");

        var (parentKey, parentHashKey) = await FolderOperations
            .GetKeyAndHashKeyAsync(client, parentUid, forPhotos: false, cancellationToken)
            .ConfigureAwait(false);

        GetNameParameters(
            newName, // FIXME: validate name
            parentKey,
            parentHashKey.Span,
            nameSessionKey,
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

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteDraftAsync(
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

                var aggregateResponse = await client.Api.Links.DeleteMultipleAsync(uidGroup.Key, request.LinkIds, cancellationToken).ConfigureAwait(false);

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

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> TrashAsync(
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

                var aggregateResponse = await client.Api.Trash.TrashMultipleAsync(uidGroup.Key, request, cancellationToken).ConfigureAwait(false);

                foreach (var (linkId, response) in aggregateResponse.Responses)
                {
                    var uid = new NodeUid(uidGroup.Key, linkId);

                    var cachedNodeInfo = await client.Cache.Entities.TryGetNodeAsync(uid, cancellationToken).ConfigureAwait(false);

                    if (cachedNodeInfo is var (node, membershipShareId, nameHashDigest))
                    {
                        // TODO: have the back-end return the trash time so that the cached value be exactly the same
                        await client.Cache.Entities.SetNodeAsync(
                            uid,
                            node with { TrashTime = DateTime.UtcNow },
                            membershipShareId,
                            nameHashDigest,
                            cancellationToken).ConfigureAwait(false);
                    }

                    var result = response.IsSuccess ? Result<Exception>.Success : new ProtonApiException(response);

                    results.TryAdd(uid, result);
                }
            }
        });

        await Task.WhenAll(tasks).ConfigureAwait(false);

        return results;
    }

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> DeleteFromTrashAsync(
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

                var aggregateResponse = await client.Api.Trash.DeleteMultipleAsync(uidGroup.Key, request, cancellationToken).ConfigureAwait(false);

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

    public static async ValueTask<IReadOnlyDictionary<NodeUid, Result<Exception>>> RestoreFromTrashAsync(
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

                var aggregateResponse = await client.Api.Trash.RestoreMultipleAsync(uidGroup.Key, request, cancellationToken).ConfigureAwait(false);

                foreach (var (linkId, response) in aggregateResponse.Responses)
                {
                    var uid = new NodeUid(uidGroup.Key, linkId);

                    var result = response.IsSuccess ? Result<Exception>.Success : new ProtonApiException(response);

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

        var folderSecrets = await FolderOperations.GetSecretsAsync(client, parentUid, forPhotos: false, cancellationToken).ConfigureAwait(false);

        var folderHashKey = folderSecrets.HashKey ?? throw new InvalidOperationException($"Folder hash key not available for {parentUid}");

        var digestsToNamesMap = new Dictionary<string, string>(batchSize);

        using var batchEnumerator = client.GetAlternateFileNames.Invoke(name).Prepend(name).Chunk(10).GetEnumerator();

        string? availableName = null;

        while (availableName is null)
        {
            digestsToNamesMap.Clear();

            batchEnumerator.MoveNext();

            foreach (var candidateName in batchEnumerator.Current)
            {
                var digest = Convert.ToHexStringLower(NodeCrypto.HashNodeName(candidateName, folderHashKey.Span));
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

        var (share, _) = await ShareOperations.GetShareAsync(client, response.ContextShareId, useCacheOnly: false, cancellationToken).ConfigureAwait(false);

        return await client.Account.GetAddressAsync(share.MembershipAddressId, cancellationToken).ConfigureAwait(false);
    }

    public static bool ValidateName(
        Result<PhasedDecryptionOutput<string>, ProtonDriveError> decryptionResult,
        [NotNullWhen(true)] out PhasedDecryptionOutput<string>? nameOutput,
        out Result<string, ProtonDriveError> nameResult,
        [NotNullWhen(true)] out PgpSessionKey? sessionKey)
    {
        if (!decryptionResult.TryGetValueElseError(out var nameOutputValue, out var decryptionError))
        {
            nameOutput = null;
            nameResult = new DecryptionError("Name decryption failed", decryptionError);
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

        if (name.Length > MaxNodeNameLength)
        {
            nameResult = new InvalidNameError(name, $"Name must be {MaxNodeNameLength} characters long at most");
            return false;
        }

        nameResult = name;
        return true;
    }

    public static async Task<ReadOnlyMemory<byte>> GetParentFolderHashKeyAsync(
        ProtonDriveClient client, NodeUid uid, bool forPhotos, CancellationToken cancellationToken)
    {
        var (node, _, _, _) = await GetNodeMetadataAsync(
            client, uid, knownShareAndKey: null, useCacheOnly: false, forPhotos, cancellationToken).ConfigureAwait(false);

        if (node.ParentUid is not { } parentUid)
        {
            throw new InvalidOperationException("Root node does not have a parent folder");
        }

        var (_, hashKey) = await FolderOperations.GetKeyAndHashKeyAsync(client, parentUid, forPhotos, cancellationToken).ConfigureAwait(false);

        return hashKey;
    }

    private static async ValueTask<FolderNode?> GetFreshExistingMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (volumeDto, shareDto, linkDetailsDto) = await client.Api.Shares.GetMyFilesShareAsync(cancellationToken).ConfigureAwait(false);

        await client.Cache.Entities.SetMyFilesShareIdAsync(shareDto.Id, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetMainVolumeIdAsync(volumeDto.Id, cancellationToken).ConfigureAwait(false);

        var nodeUid = new NodeUid(volumeDto.Id, linkDetailsDto.Link.Id);

        var (share, shareKey) = await ShareCrypto.DecryptShareAsync(
            client,
            shareDto.Id,
            shareDto.Key,
            shareDto.Passphrase,
            shareDto.MembershipAddressId,
            nodeUid,
            ShareType.Main,
            cancellationToken).ConfigureAwait(false);

        await client.Cache.Secrets.SetShareKeyAsync(share.Id, shareKey, cancellationToken).ConfigureAwait(false);
        await client.Cache.Entities.SetShareAsync(share, cancellationToken).ConfigureAwait(false);

        var (node, _, _, _) = await DtoToMetadataConverter.ConvertDtoToFolderMetadataAsync(
            client,
            volumeDto.Id,
            linkDetailsDto,
            shareKey,
            cancellationToken).ConfigureAwait(false);

        return node;
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
        var maxNameByteLength = Encoding.UTF8.GetMaxByteCount(name.Length);
        var nameBytes = MemoryPolicy.GetRentedHeapMemoryIfTooLargeForStack<byte>(maxNameByteLength, out var nameHeapMemoryOwner)
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

    private static async ValueTask<NodeMetadata?> TryGetNodeMetadataFromCacheAsync(
        ProtonDriveClient client,
        NodeUid uid,
        CancellationToken cancellationToken)
    {
        var cachedNodeInfoOrNull = await client.Cache.Entities.TryGetNodeAsync(uid, cancellationToken).ConfigureAwait(false);
        if (cachedNodeInfoOrNull is not var (node, membershipShareId, nameHashDigest))
        {
            return null;
        }

        return node switch
        {
            FolderNode folderNode => await client.Cache.Secrets.TryGetFolderSecretsAsync(uid, cancellationToken).ConfigureAwait(false) is { } folderSecrets
                ? new NodeMetadata(folderNode, folderSecrets, membershipShareId, nameHashDigest)
                : null,

            FileNode fileNode => await client.Cache.Secrets.TryGetFileSecretsAsync(uid, cancellationToken).ConfigureAwait(false) is { } fileSecrets
                ? new NodeMetadata(fileNode, fileSecrets, membershipShareId, nameHashDigest)
                : null,

            _ => throw new InvalidOperationException($"Node type \"{node.GetType().Name}\" is not supported"),
        };
    }

    private static async ValueTask<FolderNode> CreateMyFilesFolderAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var (_, _, folderNode) = await VolumeOperations.CreateVolumeAsync(client, cancellationToken).ConfigureAwait(false);

        return folderNode;
    }
}
