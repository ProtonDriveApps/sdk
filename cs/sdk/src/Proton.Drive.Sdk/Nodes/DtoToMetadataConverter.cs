using System.Collections.ObjectModel;
using Microsoft.Extensions.Logging;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
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
        var entryPointKey = linkDetailsDto.Link.ParentId is not null || linkDetailsDto.Photo is not { AlbumInclusions: { Count: > 0 } albumInclusions }
            ? await GetEntryPointKeyOrThrowAsync(
                client,
                volumeId,
                linkDetailsDto.Link.ParentId,
                knownShareAndKey,
                linkDetailsDto.Sharing?.ShareId,
                cancellationToken).ConfigureAwait(false)
            : await GetAlbumEntryPointKeyOrThrowAsync(client, volumeId, linkDetailsDto, knownShareAndKey, albumInclusions, cancellationToken)
                .ConfigureAwait(false);

        return await ConvertDtoToNodeMetadataAsync(
            client,
            volumeId,
            linkDetailsDto,
            entryPointKey,
            cancellationToken).ConfigureAwait(false);
    }

    public static async Task<Result<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        var linkType = linkDetailsDto.Link.Type;

        var nodeMetadata = linkType switch
        {
            LinkType.Folder =>
                (await ConvertDtoToFolderMetadataAsync(
                    client,
                    volumeId,
                    linkDetailsDto,
                    parentKey,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            LinkType.File =>
                (await ConvertDtoToFileMetadataAsync(
                    client,
                    volumeId,
                    linkDetailsDto,
                    parentKey,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFile, DegradedNodeMetadata.FromFile),

            LinkType.Album =>
                (await ConvertDtoToAlbumMetadataAsync(
                    client,
                    volumeId,
                    linkDetailsDto,
                    parentKey,
                    cancellationToken).ConfigureAwait(false))
                .Convert(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            // FIXME: handle other existing node types, and determine a way for forward compatibility or degraded result in case a new node type is introduced
            _ => throw new NotSupportedException($"Link type {linkType} is not supported."),
        };

        return nodeMetadata;
    }

    public static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToFolderMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        if (linkDetailsDto.Folder is null)
        {
            throw new InvalidOperationException("Node is a folder, but folder properties are missing");
        }

        return await ConvertDtoToFolderMetadataAsync(
            client,
            volumeId,
            linkDetailsDto,
            linkDetailsDto.Folder,
            parentKey,
            cancellationToken).ConfigureAwait(false);
    }

    public static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToAlbumMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        if (linkDetailsDto.Album is null)
        {
            throw new InvalidOperationException("Node is an album, but album properties are missing");
        }

        return await ConvertDtoToFolderMetadataAsync(
            client,
            volumeId,
            linkDetailsDto,
            linkDetailsDto.Album,
            parentKey,
            cancellationToken).ConfigureAwait(false);
    }

    public static async Task<Result<FileMetadata, DegradedFileMetadata>> ConvertDtoToFileMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        var linkDto = linkDetailsDto.Link;
        var fileDto = linkDetailsDto.File ?? linkDetailsDto.Photo;
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

        var decryptionResult = await NodeCrypto.DecryptFileAsync(client.Account, linkDto, fileDto, activeRevisionDto, parentKey, cancellationToken)
            .ConfigureAwait(false);

        var nodeKeyIsValid = decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey);
        var passphraseIsValid = decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput);
        var extendedAttributesIsValid = decryptionResult.ExtendedAttributes.TryGetValue(out var extendedAttributesOutput);
        var contentKeyIsValid = decryptionResult.ContentKey.TryGetValue(out var contentKeyOutput);

        var thumbnails = activeRevisionDto.Thumbnails.Select(dto => new ThumbnailHeader(dto.Id, (ThumbnailType)dto.Type)).ToList().AsReadOnly();

        var extendedAttributes = extendedAttributesOutput.Data;
        var additionalMetadata = extendedAttributes?.AdditionalMetadata?.Select(x => new AdditionalMetadataProperty(x.Key, x.Value)).ToList().AsReadOnly();

        if (!NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey)
            || !nodeKeyIsValid
            || !passphraseIsValid
            || !extendedAttributesIsValid
            || !contentKeyIsValid)
        {
            var (degradedFileMetadata, failedDecryptionFields) = CreateDegradedFileMetadata(
                linkDetailsDto,
                decryptionResult,
                nameResult,
                uid,
                activeRevisionDto,
                extendedAttributes,
                thumbnails,
                additionalMetadata,
                parentUid,
                linkDto,
                fileDto,
                nameSessionKey,
                membershipDto);

            await client.Cache.Secrets.SetFileSecretsAsync(uid, degradedFileMetadata.Secrets, cancellationToken).ConfigureAwait(false);

            await client.Cache.Entities.SetNodeAsync(uid, degradedFileMetadata.Node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken)
                .ConfigureAwait(false);

            await TelemetryRecorder.TryRecordDecryptionErrorAsync(
                client,
                DegradedNodeMetadata.FromFile(degradedFileMetadata).Node,
                failedDecryptionFields,
                cancellationToken).ConfigureAwait(false);

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

        var nodeAuthor = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure);
        var nameAuthor = decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure);
        var contentAuthor = decryptionResult.ContentAuthorshipClaim.ToAuthorshipResult(contentKeyOutput.AuthorshipVerificationFailure);

        var activeRevision = new Revision
        {
            Uid = new RevisionUid(uid, activeRevisionDto.Id),
            CreationTime = activeRevisionDto.CreationTime,
            SizeOnCloudStorage = activeRevisionDto.StorageQuotaConsumption,
            ClaimedSize = extendedAttributes?.Common?.Size,
            ClaimedModificationTime = extendedAttributes?.Common?.ModificationTime,
            ClaimedDigests =
                new FileContentDigests
                {
                    Sha1 = extendedAttributes?.Common?.Digests?.Sha1,
                    Sha1Verified = fileDto.ActiveRevision.ChecksumVerified,
                },
            Thumbnails = thumbnails.AsReadOnly(),
            AdditionalClaimedMetadata = additionalMetadata,
            ContentAuthor = contentAuthor,
        };

        var ownedBy = MapOwnedBy(linkDto.OwnedBy);
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
                AlbumUids = linkDetailsDto.Photo.AlbumInclusions.Select(a => new NodeUid(uid.VolumeId, a.Id)).ToList(),
                OwnedBy = ownedBy,
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
                OwnedBy = ownedBy,
            };

        await client.Cache.Secrets.SetFileSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        await client.Cache.Entities.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FileMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    private static (DegradedFileMetadata Metadata, List<EncryptedField> FailedDecryptionFields) CreateDegradedFileMetadata(
        LinkDetailsDto linkDetailsDto,
        FileDecryptionResult decryptionResult,
        Result<string, ProtonDriveError> nameResult,
        NodeUid uid,
        ActiveRevisionDto activeRevisionDto,
        ExtendedAttributes? extendedAttributes,
        ReadOnlyCollection<ThumbnailHeader> thumbnails,
        ReadOnlyCollection<AdditionalMetadataProperty>? additionalMetadata,
        NodeUid? parentUid,
        LinkDto linkDto,
        FileDto fileDto,
        PgpSessionKey? nameSessionKey,
        ShareMembershipSummaryDto? membershipDto)
    {
        List<EncryptedField> failedDecryptionFields = [];
        List<ProtonDriveError> errors = [];

        if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
        {
            errors.Add(new DecryptionError("Passphrase decryption failed", passphraseError));
            failedDecryptionFields.Add(EncryptedField.NodeKey);
        }
        else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
        {
            errors.Add(new DecryptionError("Node key decryption failed", nodeKeyError));
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
            revisionErrors.Add(new DecryptionError("Extended attributes decryption failed", extendedAttributesError));
            failedDecryptionFields.Add(EncryptedField.NodeExtendedAttributes);
        }

        var nodeAuthor = decryptionResult.Link.Passphrase.Merge(
            x => decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            error => new SignatureVerificationError(decryptionResult.Link.NodeAuthorshipClaim.Author, "Passphrase decryption failed", error));

        var nameAuthor = decryptionResult.Link.Name.Merge(
            x => decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            error => new SignatureVerificationError(decryptionResult.Link.NameAuthorshipClaim.Author, "Name decryption failed", error));

        var contentAuthor = decryptionResult.ContentKey.Merge(
            x => decryptionResult.ContentAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            error => new SignatureVerificationError(decryptionResult.ContentAuthorshipClaim.Author, "Content key decryption failed", error));

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
            CanDecrypt = decryptionResult.ContentKey.IsSuccess,
            Errors = revisionErrors,
        };

        var ownedBy = MapOwnedBy(linkDto.OwnedBy);
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
                AlbumUids = linkDetailsDto.Photo.AlbumInclusions.Select(a => new NodeUid(uid.VolumeId, a.Id)).ToList(),
                OwnedBy = ownedBy,
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
                OwnedBy = ownedBy,
            };

        var degradedSecrets = new DegradedFileSecrets
        {
            Key = decryptionResult.Link.NodeKey.Merge(x => (PgpPrivateKey?)x, _ => null),
            PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
            NameSessionKey = nameSessionKey,
            ContentKey = decryptionResult.ContentKey.Merge(x => (PgpSessionKey?)x.Data, _ => null),
        };

        return (new DegradedFileMetadata(degradedNode, degradedSecrets, membershipDto?.ShareId, linkDto.NameHashDigest), failedDecryptionFields);
    }

    private static async ValueTask<Result<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToFolderMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        FolderDto folderDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        var linkDto = linkDetailsDto.Link;
        var membershipDto = linkDetailsDto.Membership;

        var uid = new NodeUid(volumeId, linkDto.Id);
        var parentUid = linkDto.ParentId is not null ? (NodeUid?)new NodeUid(uid.VolumeId, linkDto.ParentId.Value) : null;

        var decryptionResult = await NodeCrypto.DecryptFolderAsync(client.Account, linkDto, folderDto.HashKey, parentKey, cancellationToken)
            .ConfigureAwait(false);

        var nodeKeyIsValid = decryptionResult.Link.NodeKey.TryGetValue(out var nodeKey);
        var passphraseIsValid = decryptionResult.Link.Passphrase.TryGetValue(out var passphraseOutput);
        var hashKeyIsValid = decryptionResult.HashKey.TryGetValue(out var hashKeyOutput);

        if (!NodeOperations.ValidateName(decryptionResult.Link.Name, out var nameOutput, out var nameResult, out var nameSessionKey)
            || !passphraseIsValid
            || !nodeKeyIsValid
            || !hashKeyIsValid)
        {
            var (degradedFolderMetadata, failedDecryptionFields) = CreateDegradedFolderMetadata(
                decryptionResult,
                nameResult,
                uid,
                parentUid,
                linkDto,
                nameSessionKey,
                membershipDto);

            await client.Cache.Secrets.SetFolderSecretsAsync(uid, degradedFolderMetadata.Secrets, cancellationToken).ConfigureAwait(false);

            await client.Cache.Entities.SetNodeAsync(uid, degradedFolderMetadata.Node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken)
                .ConfigureAwait(false);

            await TelemetryRecorder.TryRecordDecryptionErrorAsync(
                client,
                DegradedNodeMetadata.FromFolder(degradedFolderMetadata).Node,
                failedDecryptionFields,
                cancellationToken).ConfigureAwait(false);

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

        var nodeAuthorFromPassphrase = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.AuthorshipVerificationFailure);
        var nodeAuthorFromHashKey = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(hashKeyOutput.AuthorshipVerificationFailure);

        var nodeAuthor = nodeAuthorFromHashKey.IsFailure ? nodeAuthorFromHashKey : nodeAuthorFromPassphrase;

        var nameAuthor = decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure);

        var node = new FolderNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameOutput.Value.Data,
            NameAuthor = nameAuthor,
            Author = nodeAuthor,
            CreationTime = linkDto.CreationTime,
            TrashTime = linkDto.TrashTime,
            OwnedBy = MapOwnedBy(linkDto.OwnedBy),
        };

        await client.Cache.Secrets.SetFolderSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        await client.Cache.Entities.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FolderMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    private static (DegradedFolderMetadata Metadata, List<EncryptedField> FailedDecryptionFields) CreateDegradedFolderMetadata(
        FolderDecryptionResult decryptionResult,
        Result<string, ProtonDriveError> nameResult,
        NodeUid uid,
        NodeUid? parentUid,
        LinkDto linkDto,
        PgpSessionKey? nameSessionKey,
        ShareMembershipSummaryDto? membershipDto)
    {
        List<EncryptedField> failedDecryptionFields = [];
        List<ProtonDriveError> errors = [];

        if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
        {
            errors.Add(new DecryptionError("Passphrase decryption failed", passphraseError));
            failedDecryptionFields.Add(EncryptedField.NodeKey);
        }
        else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
        {
            errors.Add(new DecryptionError("Node key decryption failed", nodeKeyError));
            failedDecryptionFields.Add(EncryptedField.NodeKey);
        }
        else if (decryptionResult.HashKey.TryGetError(out var error))
        {
            errors.Add(new DecryptionError("Hash key decryption failed", error));
            failedDecryptionFields.Add(EncryptedField.NodeHashKey);
        }

        if (nameResult.IsFailure)
        {
            failedDecryptionFields.Add(EncryptedField.NodeName);
        }

        var nodeAuthorFromPassphrase = decryptionResult.Link.Passphrase.Merge(
            x => decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            _ => new SignatureVerificationError(decryptionResult.Link.NodeAuthorshipClaim.Author, "Passphrase decryption failed"));

        var nodeAuthorFromHashKey = decryptionResult.HashKey.Merge(
            x => decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            _ => new SignatureVerificationError(decryptionResult.Link.NodeAuthorshipClaim.Author, "Hash key decryption failed"));

        var nodeAuthor = nodeAuthorFromHashKey.IsFailure ? nodeAuthorFromHashKey : nodeAuthorFromPassphrase;

        var nameAuthor = decryptionResult.Link.Name.Merge(
            x => decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            _ => new SignatureVerificationError(decryptionResult.Link.NameAuthorshipClaim.Author, "Name decryption failed"));

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
            OwnedBy = MapOwnedBy(linkDto.OwnedBy),
        };

        var degradedSecrets = new DegradedFolderSecrets
        {
            Key = decryptionResult.Link.NodeKey.TryGetValue(out var key) ? key : null,
            PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
            NameSessionKey = nameSessionKey,
            HashKey = decryptionResult.HashKey.Merge(x => (ReadOnlyMemory<byte>?)x.Data, _ => null),
        };

        return (new DegradedFolderMetadata(degradedNode, degradedSecrets, membershipDto?.ShareId, linkDto.NameHashDigest), failedDecryptionFields);
    }

    private static async ValueTask<PgpPrivateKey> GetEntryPointKeyOrThrowAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? shareId,
        IDriveSecretCache secretCache,
        Func<LinkId, CancellationToken, Task<LinkDetailsDto>> getLinkDetails,
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

        // FIXME: this could go into an infinite loop if there's a structure issue in the cache.
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

            var linkDetails = await getLinkDetails(currentId.Value, cancellationToken).ConfigureAwait(false);

            linkAncestry.Push(linkDetails);

            currentShareId = linkDetails.Sharing?.ShareId;

            currentId = linkDetails.Link.ParentId;
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
                    throw new ProtonDriveException("No share available to access node");
                }

                (_, currentParentKey) = await ShareOperations.GetShareAsync(client, currentShareId.Value, useCacheOnly: false, cancellationToken)
                    .ConfigureAwait(false);
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

            currentParentKey = decryptionResult.GetFolderKeyOrThrow();
        }

        return currentParentKey;
    }

    private static async ValueTask<PgpPrivateKey> GetEntryPointKeyOrThrowAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkId? parentId,
        ShareAndKey? shareAndKeyToUse,
        ShareId? shareId,
        CancellationToken cancellationToken)
    {
        return await GetEntryPointKeyOrThrowAsync(
            client,
            volumeId,
            parentId,
            shareAndKeyToUse,
            shareId,
            client.Cache.Secrets,
            GetLinkDetailsAsync,
            cancellationToken).ConfigureAwait(false);

        async Task<LinkDetailsDto> GetLinkDetailsAsync(LinkId linkId, CancellationToken ct)
        {
            var response = await client.Api.Links.GetDetailsAsync(volumeId, [linkId], ct).ConfigureAwait(false);

            return response.Links is { Count: > 0 } links
                ? links[0]
                : throw new ProtonDriveException($"Node \"{new NodeUid(volumeId, linkId)}\" not found");
        }
    }

    private static async Task<PgpPrivateKey> GetAlbumEntryPointKeyOrThrowAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        ShareAndKey? knownShareAndKey,
        IReadOnlyList<PhotoAlbumInclusionDto> albumInclusions,
        CancellationToken cancellationToken)
    {
        var logger = client.Telemetry.GetLogger("Node metadata");

        // TODO: optimize by selecting the album that is in cache, if any
        // TODO: getting entry point key from the first album should be enough when back-end only returns accessible album IDs
        foreach (var albumInclusionId in albumInclusions.Select(albumInclusion => albumInclusion.Id))
        {
            try
            {
                return await GetEntryPointKeyOrThrowAsync(
                    client,
                    volumeId,
                    albumInclusionId,
                    knownShareAndKey,
                    linkDetailsDto.Sharing?.ShareId,
                    cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Album \"{Uid}\" not found", new NodeUid(volumeId, albumInclusionId));
            }
        }

        throw new ProtonDriveException("No album entry point key found");
    }

    private static OwnedBy MapOwnedBy(OwnedByDto? dto) => new(dto?.Email, dto?.Organization);
}
