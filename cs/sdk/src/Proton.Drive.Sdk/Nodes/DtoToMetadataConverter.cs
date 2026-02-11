using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Caching;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Shares;
using Proton.Drive.Sdk.Telemetry;
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

        return await ConvertDtoToNodeMetadataAsync(
            client,
            client.Cache.Entities,
            client.Cache.Secrets,
            volumeId,
            linkDetailsDto,
            parentKeyResult,
            cancellationToken).ConfigureAwait(false);
    }

    public static async Task<Result<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonDriveClient client,
        IEntityCache entityCache,
        IDriveSecretCache secretCache,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkType = linkDetailsDto.Link.Type;

        var nodeMetadata = linkType switch
        {
            LinkType.Folder =>
                (await ConvertDtoToFolderMetadataAsync(
                    client,
                    entityCache,
                    secretCache,
                    volumeId,
                    linkDetailsDto,
                    parentKeyResult,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            LinkType.File =>
                (await ConvertDtoToFileMetadataAsync(
                    client,
                    entityCache,
                    secretCache,
                    volumeId,
                    linkDetailsDto,
                    parentKeyResult,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFile, DegradedNodeMetadata.FromFile),

            LinkType.Album =>
                (await ConvertDtoToAlbumMetadataAsync(
                    client,
                    client.Cache.Entities,
                    client.Cache.Secrets,
                    volumeId,
                    linkDetailsDto,
                    parentKeyResult,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            // FIXME: handle other existing node types, and determine a way for forward compatibility or degraded result in case a new node type is introduced
            _ => throw new NotSupportedException($"Link type {linkType} is not supported."),
        };

        return nodeMetadata;
    }

    public static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToFolderMetadataAsync(
        ProtonDriveClient client,
        IEntityCache entityCache,
        IDriveSecretCache secretCache,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        if (linkDetailsDto.Folder is null)
        {
            throw new InvalidOperationException("Node is a folder, but folder properties are missing");
        }

        return await ConvertDtoToFolderMetadataAsync(
            client,
            entityCache,
            secretCache,
            volumeId,
            linkDetailsDto,
            linkDetailsDto.Folder,
            parentKeyResult,
            cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToAlbumMetadataAsync(
        ProtonDriveClient client,
        IEntityCache entityCache,
        IDriveSecretCache secretCache,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        if (linkDetailsDto.Album is null)
        {
            throw new InvalidOperationException("Node is an album, but album properties are missing");
        }

        return await ConvertDtoToFolderMetadataAsync(
            client,
            entityCache,
            secretCache,
            volumeId,
            linkDetailsDto,
            linkDetailsDto.Album,
            parentKeyResult,
            cancellationToken).ConfigureAwait(false);
    }

    public static async Task<Result<FileMetadata, DegradedFileMetadata>> ConvertDtoToFileMetadataAsync(
        ProtonDriveClient client,
        IEntityCache entityCache,
        IDriveSecretCache secretCache,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkDto = linkDetailsDto.Link;
        var fileDto = linkDetailsDto.File;
        var membershipDto = linkDetailsDto.Membership;

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

        var decryptionResult = await NodeCrypto.DecryptFileAsync(client.Account, linkDto, fileDto, activeRevisionDto, parentKeyResult, cancellationToken)
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
            ? decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure
                ?? contentKeyOutput.AuthorshipVerificationFailure)
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
            List<EncryptedField> failedDecryptionFields = [];
            List<ProtonDriveError> errors = [];

            if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
            {
                errors.Add(new DecryptionError(passphraseError));
                failedDecryptionFields.Add(EncryptedField.NodeKey);
            }
            else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
            {
                errors.Add(new DecryptionError(nodeKeyError));
                failedDecryptionFields.Add(EncryptedField.NodeKey);
            }
            else if (decryptionResult.ContentKey.IsFailure)
            {
                failedDecryptionFields.Add(EncryptedField.NodeContentKey);
            }

            if (nameResult.IsFailure)
            {
                failedDecryptionFields.Add(EncryptedField.NodeName);
            }

            var revisionErrors = new List<ProtonDriveError>();
            if (decryptionResult.ExtendedAttributes.TryGetError(out var extendedAttributesError))
            {
                revisionErrors.Add(new DecryptionError(extendedAttributesError));
                failedDecryptionFields.Add(EncryptedField.NodeExtendedAttributes);
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
                CanDecrypt = !contentKeyIsInvalid,
                Errors = revisionErrors,
            };

            var degradedNode = linkDetailsDto.Photo is not null
                ? new DegradedPhotoNode
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
                    CaptureTime = linkDetailsDto.Photo.CaptureTime,
                }
                : new DegradedFileNode
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

            await secretCache.SetFileSecretsAsync(uid, degradedSecrets, cancellationToken).ConfigureAwait(false);

            var degradedFileMetadata = new DegradedFileMetadata(degradedNode, degradedSecrets, membershipDto?.ShareId, linkDto.NameHashDigest);

            await entityCache.SetNodeAsync(uid, degradedNode, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

            await ReportDecryptionError(client, DegradedNodeMetadata.FromFile(degradedFileMetadata), failedDecryptionFields, cancellationToken)
                .ConfigureAwait(false);

            return degradedFileMetadata;
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

        var node = linkDetailsDto.Photo is not null
            ? new PhotoNode
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
                CaptureTime = linkDetailsDto.Photo.CaptureTime,
            }
            : new FileNode
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

        await secretCache.SetFileSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        await entityCache.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FileMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    private static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToFolderMetadataAsync(
        ProtonDriveClient client,
        IEntityCache entityCache,
        IDriveSecretCache secretCache,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        FolderDto folderDto,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkDto = linkDetailsDto.Link;
        var membershipDto = linkDetailsDto.Membership;

        if (folderDto is null)
        {
            var linkType = linkDetailsDto.Link.Type is LinkType.Folder ? "folder" : "album";
            throw new InvalidOperationException($"Node is a {linkType}, but {linkType} properties are missing");
        }

        var uid = new NodeUid(volumeId, linkDto.Id);
        var parentUid = linkDto.ParentId is not null ? (NodeUid?)new NodeUid(uid.VolumeId, linkDto.ParentId.Value) : null;

        var decryptionResult = await NodeCrypto.DecryptFolderAsync(client.Account, linkDto, folderDto.HashKey, parentKeyResult, cancellationToken)
            .ConfigureAwait(false);

        var nameIsInvalid = !NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey);
        var nodeKeyIsInvalid = !decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey);
        var passphraseIsInvalid = !decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput);
        var hashKeyIsInvalid = !decryptionResult.HashKey.TryGetValue(out var hashKeyOutput);

        var nameAuthor = !nameIsInvalid && nameOutput.HasValue
            ? decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure)
            : default;
        var nodeAuthor = !passphraseIsInvalid && !hashKeyIsInvalid
            ? decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure
                ?? hashKeyOutput.AuthorshipVerificationFailure)
            : default;

        if (
            nameIsInvalid || nameSessionKey is null || nameOutput is null
            || passphraseIsInvalid || nodeKeyIsInvalid || hashKeyIsInvalid)
        {
            List<EncryptedField> failedDecryptionFields = [];
            List<ProtonDriveError> errors = [];

            if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
            {
                errors.Add(new DecryptionError(passphraseError));
                failedDecryptionFields.Add(EncryptedField.NodeKey);
            }
            else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
            {
                errors.Add(new DecryptionError(nodeKeyError));
                failedDecryptionFields.Add(EncryptedField.NodeKey);
            }
            else if (decryptionResult.HashKey.TryGetError(out var hashKeyError))
            {
                errors.Add(new DecryptionError(hashKeyError));
                failedDecryptionFields.Add(EncryptedField.NodeHashKey);
            }

            if (nameResult.IsFailure)
            {
                failedDecryptionFields.Add(EncryptedField.NodeName);
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

            await secretCache.SetFolderSecretsAsync(uid, degradedSecrets, cancellationToken).ConfigureAwait(false);

            var degradedFolderMetadata = new DegradedFolderMetadata(degradedNode, degradedSecrets, membershipDto?.ShareId, linkDto.NameHashDigest);

            await entityCache.SetNodeAsync(uid, degradedNode, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

            await ReportDecryptionError(client, DegradedNodeMetadata.FromFolder(degradedFolderMetadata), failedDecryptionFields, cancellationToken)
                .ConfigureAwait(false);

            return degradedFolderMetadata;
        }

        var secrets = new FolderSecrets
        {
            Key = nodeKey,
            PassphraseSessionKey = passphraseOutput.SessionKey,
            NameSessionKey = nameSessionKey.Value,
            HashKey = hashKeyOutput.Data,
            PassphraseForAnonymousMove = decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous ? passphraseOutput.Data : null,
        };

        await secretCache.SetFolderSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

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

        await entityCache.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FolderMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    private static async ValueTask<Result<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? shareId,
        IDriveSecretCache secretCache,
        Func<IEnumerable<LinkId>, CancellationToken, Task<LinkDetailsDto>> getLinkDetails,
        CancellationToken cancellationToken)
    {
        if (shareId is not null && shareId == shareAndKeyToUse?.Share.Id)
        {
            return shareAndKeyToUse.Value.Key;
        }

        var currentId = parentId;
        var currentShareId = shareId;

        var linkAncestry = new Stack<LinkDetailsDto>(8);

        PgpPrivateKey? lastKey = null;

        try
        {
            // FIXME this could go into an infinite loop if there's a structure issue in the cache.
            while (currentId is not null)
            {
                if (shareAndKeyToUse is var (shareToUse, shareKeyToUse) && currentId == shareToUse.RootFolderId.LinkId)
                {
                    lastKey = shareKeyToUse;
                    break;
                }

                var nodeUid = new NodeUid(volumeId, currentId.Value);

                var folderSecretsResult = await secretCache.TryGetFolderSecretsAsync(nodeUid, cancellationToken).ConfigureAwait(false);

                var folderKey = folderSecretsResult?.Merge(x => x.Key, x => x.Key);

                if (folderKey is not null)
                {
                    lastKey = folderKey.Value;
                    break;
                }

                var linkDetails = await getLinkDetails([currentId.Value], cancellationToken).ConfigureAwait(false);

                linkAncestry.Push(linkDetails);

                currentShareId = linkDetails.Sharing?.ShareId;

                currentId = linkDetails.Link.ParentId;
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
                client.Cache.Entities,
                client.Cache.Secrets,
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

    private static async ValueTask<Result<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? shareId,
        CancellationToken cancellationToken)
    {
        return await GetParentKeyAsync(client, volumeId, parentId, shareAndKeyToUse, shareId, client.Cache.Secrets, GetLinkDetailsAsync, cancellationToken)
            .ConfigureAwait(false);

        async Task<LinkDetailsDto> GetLinkDetailsAsync(IEnumerable<LinkId> links, CancellationToken ct)
        {
            var response = await client.Api.Links.GetDetailsAsync(volumeId, links, ct).ConfigureAwait(false);
            return response.Links[0];
        }
    }

    private static async Task ReportDecryptionError(
        ProtonDriveClient client,
        DegradedNodeMetadata degradedNode,
        List<EncryptedField> failedDecryptionFields,
        CancellationToken cancellationToken)
    {
        var legacyBoundary = new DateTime(2024, 1, 1, 0, 0, 0, 0, 0, DateTimeKind.Utc);

        try
        {
            // FIXME won't work for photos in an album, this will need to be differentiated for photos.
            var share = await ShareOperations.GetContextShareAsync(client, degradedNode, cancellationToken).ConfigureAwait(false);

            foreach (var failedField in failedDecryptionFields)
            {
                client.Telemetry.RecordMetric(new DecryptionErrorEvent
                {
                    Uid = degradedNode.Node.Uid.ToString(),
                    Field = failedField,
                    VolumeType = VolumeTypeFactory.FromShareType(share.Share.Type),
                    FromBefore2024 = degradedNode.Node.CreationTime.CompareTo(legacyBoundary) < 1,
                    Error = string.Empty,
                });
            }
        }
        catch
        {
            // Do nothing
        }
    }
}
