using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class DtoToMetadataConverter
{
    public static async Task<Result<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        ShareAndKey? knownShareAndKey,
        CancellationToken cancellationToken)
    {
        var parentKeyResult = await GetParentKeyAsync(
            client,
            volumeId,
            linkDetailsDto.Link.ParentId,
            knownShareAndKey,
            linkDetailsDto.Sharing?.ShareId,
            cancellationToken).ConfigureAwait(false);

        return await ConvertDtoToNodeMetadataAsync(client, volumeId, linkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false);
    }

    public static async Task<Result<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkType = linkDetailsDto.Link.Type;

        return linkType switch
        {
            LinkType.Folder =>
                (await ConvertDtoToFolderMetadataAsync(client, volumeId, linkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            LinkType.File =>
                (await ConvertDtoToFileMetadataAsync(client, volumeId, linkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFile, DegradedNodeMetadata.FromFile),

            // FIXME: handle other existing node types, and determine a way for forward compatibility or degraded result in case a new node type is introduced
            _ => throw new NotSupportedException($"Link type {linkType} is not supported."),
        };
    }

    public static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToFolderMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var (linkDto, folderDto, _, _, membershipDto) = linkDetailsDto;

        if (folderDto is null)
        {
            // FIXME: handle missing file information with degraded node
            throw new InvalidOperationException("Node is a file, but file properties are missing");
        }

        var uid = new NodeUid(volumeId, linkDto.Id);
        var parentUid = linkDto.ParentId is not null ? (NodeUid?)new NodeUid(uid.VolumeId, linkDto.ParentId.Value) : null;

        var decryptionResult = await NodeCrypto.DecryptFolderAsync(client, linkDto, folderDto, parentKeyResult, cancellationToken).ConfigureAwait(false);

        if (!NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey)
            || !decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey)
            || !decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput)
            || !decryptionResult.HashKey.TryGetValue(out var hashKeyOutput))
        {
            // FIXME: complete degraded node and cache it
            var degradedNode = new DegradedFolderNode
            {
                Uid = uid,
                ParentUid = parentUid,
                Name = nameResult,
                NameAuthor = default,
                TrashTime = linkDto.TrashTime,
                Author = default,
                Errors = null!, // FIXME
            };

            // FIXME: cache secrets
            var degradedSecrets = new DegradedFolderSecrets
            {
                Key = decryptionResult.Link.NodeKey.GetValueOrDefault(),
                PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
                NameSessionKey = nameSessionKey,
                HashKey = decryptionResult.HashKey.Merge(x => (ReadOnlyMemory<byte>?)x.Data, _ => null),
            };

            var nameOrError = decryptionResult.Link.Name.TryGetValueElseError(out var nameValue, out var error) ? nameValue.Data : error;
            var name = (NodeOperations.ValidateName(decryptionResult.Link.Name, out _, out _, out _) ? "✅ " : "❌ ") + $"(\"{nameOrError}\")";
            var nk = decryptionResult.Link.NodeKey.TryGetValueElseError(out _, out var nkError) ? "✅" : $"❌ (\"{nkError}\")";
            var pp = decryptionResult.Link.Passphrase.TryGetValueElseError(out _, out var ppError) ? "✅" : $"❌ (\"{ppError}\")";
            var hk = decryptionResult.HashKey.TryGetValueElseError(out _, out var hkError) ? "✅" : $"❌ (\"{hkError}\")";

            throw new TempDebugException($"Name: {name}, Node key: {nk}, Passphrase: {pp}, Hash Key: {hk}");
        }

        var secrets = new FolderSecrets
        {
            Key = nodeKey,
            PassphraseSessionKey = passphraseOutput.SessionKey,
            NameSessionKey = nameSessionKey.Value,
            HashKey = hashKeyOutput.Data,
            PassphraseForAnonymousMove = decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous ? passphraseOutput.Data : null,
        };

        await client.Cache.Secrets.SetFolderSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        var node = new FolderNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameOutput.Value.Data,
            NameAuthor = decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure),

            // FIXME: combine with verification failure from name hash key
            Author = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure),
            TrashTime = linkDto.TrashTime,
        };

        await client.Cache.Entities.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FolderMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    public static async Task<Result<FileMetadata, DegradedFileMetadata>> ConvertDtoToFileMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var (linkDto, _, fileDto, _, membershipDto) = linkDetailsDto;

        if (fileDto is null)
        {
            // FIXME: handle missing file information with degraded node
            throw new InvalidOperationException("Node is a file, but file properties are missing");
        }

        if (linkDto.State is LinkState.Draft)
        {
            // We don't currently expect draft nodes
            throw new NotSupportedException("Draft nodes are not supported");
        }

        if (fileDto.ActiveRevision is not { } activeRevisionDto)
        {
            // FIXME: handle missing revision information with degraded node
            throw new InvalidOperationException("Node is a non-draft file, but active revision properties are missing");
        }

        var uid = new NodeUid(volumeId, linkDto.Id);
        var parentUid = linkDto.ParentId is not null ? (NodeUid?)new NodeUid(uid.VolumeId, linkDto.ParentId.Value) : null;

        var decryptionResult = await NodeCrypto.DecryptFileAsync(client, linkDto, fileDto, activeRevisionDto, parentKeyResult, cancellationToken)
            .ConfigureAwait(false);

        if (!NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey)
            || !decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey)
            || !decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput)
            || !decryptionResult.ExtendedAttributes.TryGetValue(out var extendedAttributesOutput)
            || !decryptionResult.ContentKey.TryGetValue(out var contentKeyOutput))
        {
            // FIXME: complete degraded node and cache it
            var degradedNode = new DegradedFileNode
            {
                Uid = uid,
                ParentUid = parentUid,
                Name = nameResult,
                NameAuthor = default,
                TrashTime = linkDto.TrashTime,
                Author = default,
                MediaType = fileDto.MediaType,
                ActiveRevision = null,
                TotalStorageQuotaUsage = fileDto.TotalStorageQuotaUsage,
                Errors = null!,
            };

            // FIXME: cache secrets
            var degradedSecrets = new DegradedFileSecrets
            {
                Key = decryptionResult.Link.NodeKey.GetValueOrDefault(),
                PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
                NameSessionKey = nameSessionKey,
                ContentKey = decryptionResult.ContentKey.Merge(x => (PgpSessionKey?)x.Data, _ => null),
            };

            var nameOrError = decryptionResult.Link.Name.TryGetValueElseError(out var nameValue, out var error) ? nameValue.Data : error;
            var name = (NodeOperations.ValidateName(decryptionResult.Link.Name, out _, out _, out _) ? "✅ " : "❌ ") + $"(\"{nameOrError}\")";
            var nk = decryptionResult.Link.NodeKey.TryGetValueElseError(out _, out var nkError) ? "✅" : $"❌ (\"{nkError}\")";
            var pp = decryptionResult.Link.Passphrase.TryGetValueElseError(out _, out var ppError) ? "✅" : $"❌ (\"{ppError}\")";
            var ea = decryptionResult.ExtendedAttributes.TryGetValueElseError(out _, out var eaError) ? "✅" : $"❌ (\"{eaError}\")";
            var ck = decryptionResult.ContentKey.TryGetValueElseError(out _, out var ckError) ? "✅" : $"❌ (\"{ckError}\")";

            throw new TempDebugException($"Name: {name}, Node key: {nk}, Passphrase: {pp}, Extended Attributes: {ea}, Content Key: {ck}");
        }

        var secrets = new FileSecrets
        {
            Key = nodeKey,
            PassphraseSessionKey = passphraseOutput.SessionKey,
            NameSessionKey = nameSessionKey.Value,
            ContentKey = contentKeyOutput.Data,
            PassphraseForAnonymousMove = decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous
                ? passphraseOutput.Data
                : (ReadOnlyMemory<byte>?)null,
        };

        await client.Cache.Secrets.SetFileSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        var extendedAttributes = extendedAttributesOutput.Data;

        var node = new FileNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameOutput.Value.Data,
            NameAuthor = decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure),

            // FIXME: combine with verification failure from name hash key
            Author = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure),
            TrashTime = linkDto.TrashTime,
            MediaType = fileDto.MediaType,
            ActiveRevision = new Revision
            {
                Uid = new RevisionUid(uid, activeRevisionDto.Id),
                CreationTime = activeRevisionDto.CreationTime,
                StorageQuotaConsumption = activeRevisionDto.StorageQuotaConsumption,
                ClaimedSize = extendedAttributes?.Common?.Size,
                ClaimedModificationTime = extendedAttributes?.Common?.ModificationTime,
                Thumbnails = [], // FIXME: thumbnails
                ContentAuthor = decryptionResult.ContentAuthorshipClaim.ToAuthorshipResult(extendedAttributesOutput.AuthorshipVerificationFailure),
            },
            TotalStorageQuotaUsage = fileDto.TotalStorageQuotaUsage,
        };

        await client.Cache.Entities.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FileMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    private static async ValueTask<Result<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? childShareId,
        CancellationToken cancellationToken)
    {
        if (childShareId is not null && childShareId == shareAndKeyToUse?.Share.Id)
        {
            return shareAndKeyToUse.Value.Key;
        }

        var currentId = parentId;
        var currentShareId = childShareId;

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

                var folderSecretsResult = await client.Cache.Secrets.TryGetFolderSecretsAsync(new NodeUid(volumeId, currentId.Value), cancellationToken)
                    .ConfigureAwait(false);

                var folderKey = folderSecretsResult?.Merge(x => x.Key, x => x.Key);

                if (folderKey is not null)
                {
                    lastKey = folderKey.Value;
                    break;
                }

                var linkDetailsResponse = await client.Api.Links.GetDetailsAsync(volumeId, [currentId.Value], cancellationToken).ConfigureAwait(false);

                var linkDetails = linkDetailsResponse.Links[0];

                linkAncestry.Push(linkDetails);

                var (link, _, _, sharing, _) = linkDetails;

                currentShareId = sharing?.ShareId;

                currentId = link.ParentId;
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
                if (currentShareId is null)
                {
                    return new ProtonDriveError("No share available to access node");
                }

                (_, currentParentKey) = await ShareOperations.GetShareAsync(client, currentShareId.Value, cancellationToken).ConfigureAwait(false);
            }
        }

        while (linkAncestry.TryPop(out var ancestorLinkDetails))
        {
            var decryptionResult = await ConvertDtoToNodeMetadataAsync(
                client,
                volumeId,
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
}

public sealed class TempDebugException : Exception
{
    public TempDebugException(string message)
        : base(message)
    {
    }

    public TempDebugException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public TempDebugException()
    {
    }
}
