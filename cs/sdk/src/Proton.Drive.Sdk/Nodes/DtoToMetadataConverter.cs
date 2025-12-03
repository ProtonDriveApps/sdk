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

        var nameIsInvalid = !NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey);
        var nodeKeyIsInvalid = !decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey);
        var passphraseIsInvalid = !decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput);
        var hashKeyIsInvalid = !decryptionResult.HashKey.TryGetValue(out var hashKeyOutput);

        var nameAuthor = !nameIsInvalid && nameOutput.HasValue
            ? decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure)
            : default;
        var nodeAuthor = !passphraseIsInvalid && !hashKeyIsInvalid
            ? decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure ?? hashKeyOutput.AuthorshipVerificationFailure)
            : default;

        if (
            nameIsInvalid || nameSessionKey is null || nameOutput is null
            || passphraseIsInvalid || nodeKeyIsInvalid || hashKeyIsInvalid)
        {
            var errors = new List<ProtonDriveError>();

            if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
            {
                errors.Add(new DecryptionError(passphraseError ?? "Failed to decrypt passphrase"));
            }
            else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
            {
                errors.Add(new DecryptionError(nodeKeyError ?? "Failed to decrypt node key"));
            }
            else if (decryptionResult.HashKey.TryGetError(out var hashKeyError))
            {
                errors.Add(new DecryptionError(hashKeyError ?? "Failed to decrypt hash key"));
            }

            var degradedNode = new DegradedFolderNode
            {
                Uid = uid,
                ParentUid = parentUid,
                Name = nameResult,
                NameAuthor = nameAuthor,
                CreationTime = linkDto.CreationTime,
                TrashTime = linkDto.TrashTime,
                Author = nodeAuthor,
                Errors = errors,
            };

            var degradedSecrets = new DegradedFolderSecrets
            {
                Key = decryptionResult.Link.NodeKey.GetValueOrDefault(),
                PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
                NameSessionKey = nameSessionKey,
                HashKey = decryptionResult.HashKey.Merge(x => (ReadOnlyMemory<byte>?)x.Data, _ => null),
            };

            await client.Cache.Secrets.SetFolderSecretsAsync(uid, degradedSecrets, cancellationToken).ConfigureAwait(false);

            // FIXME: remove entity cache or cache degraded node

            return new DegradedFolderMetadata(degradedNode, degradedSecrets, membershipDto?.ShareId, linkDto.NameHashDigest);
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
            NameAuthor = nameAuthor,
            Author = nodeAuthor,
            CreationTime = linkDto.CreationTime,
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

        var nameIsInvalid = !NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey);
        var nodeKeyIsInvalid = !decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey);
        var passphraseIsInvalid = !decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput);
        var extendedAttributesIsInvalid = !decryptionResult.ExtendedAttributes.TryGetValue(out var extendedAttributesOutput);
        var contentKeyIsInvalid = !decryptionResult.ContentKey.TryGetValue(out var contentKeyOutput);

        var nameAuthor = !nameIsInvalid && nameOutput.HasValue
            ? decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure)
            : default;

        var nodeAuthor = !passphraseIsInvalid
            ? decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure ?? contentKeyOutput.AuthorshipVerificationFailure)
            : default;

        var contentAuthor = !extendedAttributesIsInvalid
            ? decryptionResult.ContentAuthorshipClaim.ToAuthorshipResult(extendedAttributesOutput.AuthorshipVerificationFailure)
            : default;

        var extendedAttributes = extendedAttributesOutput.Data;

        var thumbnails = activeRevisionDto.Thumbnails.Count > 0 ? new ThumbnailHeader[activeRevisionDto.Thumbnails.Count] : [];

        var additionalMetadata = extendedAttributes?.AdditionalMetadata?.Select(x => new AdditionalMetadataProperty(x.Key, x.Value)).ToList().AsReadOnly();

        for (var i = 0; i < activeRevisionDto.Thumbnails.Count; ++i)
        {
            var thumbnailDto = activeRevisionDto.Thumbnails[i];
            thumbnails[i] = new ThumbnailHeader(thumbnailDto.Id, (ThumbnailType)thumbnailDto.Type);
        }

        if (
            nameIsInvalid || (nameSessionKey is null) || nameOutput is null
            || passphraseIsInvalid
            || nodeKeyIsInvalid
            || extendedAttributesIsInvalid
            || contentKeyIsInvalid)
        {
            var errors = new List<ProtonDriveError>();
            if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
            {
                errors.Add(new DecryptionError(passphraseError ?? "Failed to decrypt passphrase"));
            }
            else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
            {
                errors.Add(new DecryptionError(nodeKeyError ?? "Failed to decrypt node key"));
            }

            var revisionErrors = new List<ProtonDriveError>();
            if (decryptionResult.ExtendedAttributes.TryGetError(out var extendedAttributesError))
            {
                revisionErrors.Add(new DecryptionError(extendedAttributesError ?? "Failed to decrypt extended attributes key"));
            }

            var degradedRevision = new DegradedRevision
            {
                Uid = new RevisionUid(uid, activeRevisionDto.Id),
                CreationTime = activeRevisionDto.CreationTime,
                SizeOnCloudStorage = activeRevisionDto.StorageQuotaConsumption,
                ClaimedSize = extendedAttributes?.Common?.Size,
                ClaimedModificationTime = extendedAttributes?.Common?.ModificationTime,
                ClaimedDigests = new FileContentDigests { Sha1 = extendedAttributes?.Common?.Digests?.Sha1 },
                Thumbnails = thumbnails.AsReadOnly(),
                AdditionalClaimedMetadata = additionalMetadata,
                ContentAuthor = contentAuthor,
                Errors = (IReadOnlyList<ProtonDriveError>)revisionErrors,
            };

            var degradedNode = new DegradedFileNode
            {
                Uid = uid,
                ParentUid = parentUid,
                Name = nameResult,
                NameAuthor = nameAuthor,
                CreationTime = linkDto.CreationTime,
                TrashTime = linkDto.TrashTime,
                Author = nodeAuthor,
                MediaType = fileDto.MediaType,
                ActiveRevision = degradedRevision,
                TotalStorageQuotaUsage = fileDto.TotalSizeOnStorage,
                Errors = errors,
            };

            var degradedSecrets = new DegradedFileSecrets
            {
                Key = decryptionResult.Link.NodeKey.GetValueOrDefault(),
                PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
                NameSessionKey = nameSessionKey,
                ContentKey = decryptionResult.ContentKey.Merge(x => (PgpSessionKey?)x.Data, _ => null),
            };

            await client.Cache.Secrets.SetFileSecretsAsync(uid, degradedSecrets, cancellationToken).ConfigureAwait(false);
            // FIXME: remove entity cache or cache degraded node

            return new DegradedFileMetadata(degradedNode, degradedSecrets, membershipDto?.ShareId, linkDto.NameHashDigest);
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

        var activeRevision = new Revision
        {
            Uid = new RevisionUid(uid, activeRevisionDto.Id),
            CreationTime = activeRevisionDto.CreationTime,
            SizeOnCloudStorage = activeRevisionDto.StorageQuotaConsumption,
            ClaimedSize = extendedAttributes?.Common?.Size,
            ClaimedModificationTime = extendedAttributes?.Common?.ModificationTime,
            ClaimedDigests = new FileContentDigests { Sha1 = extendedAttributes?.Common?.Digests?.Sha1 },
            Thumbnails = thumbnails.AsReadOnly(),
            AdditionalClaimedMetadata = additionalMetadata,
            ContentAuthor = contentAuthor,
        };

        var node = new FileNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameOutput.Value.Data,
            NameAuthor = nameAuthor,
            Author = nodeAuthor,
            CreationTime = linkDto.CreationTime,
            TrashTime = linkDto.TrashTime,
            MediaType = fileDto.MediaType,
            ActiveRevision = activeRevision,
            TotalSizeOnCloudStorage = fileDto.TotalSizeOnStorage,
        };

        await client.Cache.Secrets.SetFileSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

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
