using System.Collections.ObjectModel;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Photos;
using Proton.Drive.Sdk.Nodes.Cryptography;
using Proton.Drive.Sdk.Telemetry;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class DtoToMetadataConverter
{
    public static async Task<NodeMetadataConversionResult> ConvertDtoToNodeMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        PgpPrivateKey passphraseDecryptionKey,
        CancellationToken cancellationToken)
    {
        var conversionResult = linkDetailsDto.Link.Type switch
        {
            LinkType.Folder => NodeMetadataConversionResult.FromFolder(
                await ConvertFolderMetadataAsync(
                    client.Account,
                    volumeId,
                    linkDetailsDto,
                    linkDetailsDto.Folder ?? throw new InvalidOperationException("Node is a folder, but folder properties are missing"),
                    passphraseDecryptionKey,
                    cancellationToken).ConfigureAwait(false)),

            LinkType.File => NodeMetadataConversionResult.FromFile(
                await ConvertFileMetadataAsync(
                    client.Account,
                    volumeId,
                    linkDetailsDto,
                    passphraseDecryptionKey,
                    cancellationToken).ConfigureAwait(false)),

            LinkType.Album => NodeMetadataConversionResult.FromFolder(
                await ConvertAlbumMetadataAsync(
                    client.Account,
                    volumeId,
                    linkDetailsDto,
                    linkDetailsDto.Album ?? throw new InvalidOperationException("Node is an album, but album properties are missing"),
                    passphraseDecryptionKey,
                    cancellationToken).ConfigureAwait(false)),

            // FIXME: handle other existing node types, and determine a way for forward compatibility or degraded result in case a new node type is introduced
            var linkType => throw new NotSupportedException($"Link type {linkType} is not supported."),
        };

        if (conversionResult.FailedDecryptionFields.Count > 0)
        {
            await TelemetryRecorder.TryRecordDecryptionErrorAsync(
                client,
                conversionResult.Metadata.Node,
                conversionResult.FailedDecryptionFields,
                cancellationToken).ConfigureAwait(false);
        }

        return conversionResult;
    }

    private static async Task<FileMetadataConversionResult> ConvertFileMetadataAsync(
        IProtonAccountClient account,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        PgpPrivateKey passphraseDecryptionKey,
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

        var decryptionResult = await NodeCrypto
            .DecryptFileAsync(account, linkDto, fileDto, activeRevisionDto, passphraseDecryptionKey, cancellationToken).ConfigureAwait(false);

        NodeOperations.ValidateName(decryptionResult.Link.Name, out _, out var nameResult, out var nameSessionKey);

        ExtendedAttributes? extendedAttributes = null;
        if (decryptionResult.ExtendedAttributes.TryGetValue(out var extendedAttributesOutput))
        {
            extendedAttributes = extendedAttributesOutput.Data;
        }

        var thumbnails = activeRevisionDto.Thumbnails.Select(dto => new ThumbnailHeader(dto.Id, (ThumbnailType)dto.Type)).ToList().AsReadOnly();
        var additionalMetadata = extendedAttributes?.AdditionalMetadata?.Select(x => new AdditionalMetadataProperty(x.Key, x.Value)).ToList().AsReadOnly();
        var modificationTimeResult = extendedAttributes?.Common?.ModificationTime;

        return BuildFileMetadata(
            linkDetailsDto,
            decryptionResult,
            nameResult,
            nameSessionKey,
            uid,
            parentUid,
            linkDto,
            fileDto,
            activeRevisionDto,
            extendedAttributes,
            modificationTimeResult,
            thumbnails,
            additionalMetadata,
            membershipDto);
    }

    private static async ValueTask<FolderMetadataConversionResult> ConvertFolderMetadataAsync(
        IProtonAccountClient account,
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

        var decryptionResult = await NodeCrypto.DecryptFolderAsync(account, linkDto, folderDto.HashKey, parentKey, cancellationToken)
            .ConfigureAwait(false);

        NodeOperations.ValidateName(decryptionResult.Link.Name, out _, out var nameResult, out var nameSessionKey);

        return BuildFolderMetadata(
            decryptionResult,
            nameResult,
            nameSessionKey,
            uid,
            parentUid,
            linkDto,
            linkDetailsDto.Sharing,
            membershipDto);
    }

    private static async ValueTask<FolderMetadataConversionResult> ConvertAlbumMetadataAsync(
        IProtonAccountClient account,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        AlbumDto albumDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        // Albums decrypt like folders; the album metadata (photo count, cover photo, last activity time)
        // comes from the link details and is layered onto an AlbumNode.
        var folderDto = new FolderDto { HashKey = albumDto.HashKey, ExtendedAttributes = albumDto.ExtendedAttributes };

        var folderResult = await ConvertFolderMetadataAsync(account, volumeId, linkDetailsDto, folderDto, parentKey, cancellationToken)
            .ConfigureAwait(false);

        var coverPhotoUid = albumDto.CoverLinkId is { } coverLinkId ? new NodeUid(volumeId, coverLinkId) : (NodeUid?)null;

        var albumNode = new AlbumNode(folderResult.Metadata.Node)
        {
            PhotoCount = albumDto.PhotoCount,
            CoverPhotoUid = coverPhotoUid,
            LastActivityTime = albumDto.LastActivityTime,
        };

        return folderResult with { Metadata = folderResult.Metadata with { Node = albumNode } };
    }

    private static FileMetadataConversionResult BuildFileMetadata(
        LinkDetailsDto linkDetailsDto,
        FileDecryptionResult decryptionResult,
        Result<string, ProtonDriveError> nameResult,
        PgpSessionKey? nameSessionKey,
        NodeUid uid,
        NodeUid? parentUid,
        LinkDto linkDto,
        FileDto fileDto,
        ActiveRevisionDto activeRevisionDto,
        ExtendedAttributes? extendedAttributes,
        Result<DateTime, ProtonDriveError>? modificationTimeResult,
        ReadOnlyCollection<ThumbnailHeader> thumbnails,
        ReadOnlyCollection<AdditionalMetadataProperty>? additionalMetadata,
        ShareMembershipSummaryDto? membershipDto)
    {
        var (nodeErrors, failedDecryptionFields) = CollectFileDecryptionFailures(
            decryptionResult,
            nameResult,
            modificationTimeResult);

        var nodeAuthor = decryptionResult.Link.Passphrase.Merge(
            x => decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            error => new SignatureVerificationError(decryptionResult.Link.NodeAuthorshipClaim.Author, "Passphrase decryption failed", error));

        var nameAuthor = decryptionResult.Link.Name.Merge(
            x => decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            error => new SignatureVerificationError(decryptionResult.Link.NameAuthorshipClaim.Author, "Name decryption failed", error));

        var contentAuthor = decryptionResult.ContentKey.Merge(
            x => decryptionResult.ContentAuthorshipClaim.ToAuthorshipResult(x.AuthorshipVerificationFailure),
            error => new SignatureVerificationError(decryptionResult.ContentAuthorshipClaim.Author, "Content key decryption failed", error));

        var activeRevision = new Revision
        {
            Uid = new RevisionUid(uid, activeRevisionDto.Id),
            State = RevisionState.Active,
            CreationTime = activeRevisionDto.CreationTime,
            StorageSize = activeRevisionDto.StorageQuotaConsumption,
            ClaimedSize = extendedAttributes?.Common?.Size,
            ClaimedModificationTime = modificationTimeResult?.GetValueOrDefault(),
            ClaimedDigests = new FileContentDigests
            {
                Sha1 = extendedAttributes?.Common?.Digests?.Sha1,
                Sha1Verified = decryptionResult.ExtendedAttributes.IsSuccess && (activeRevisionDto.ChecksumVerified ?? false),
            },
            Thumbnails = thumbnails,
            ClaimedAdditionalMetadata = additionalMetadata,
            ContentAuthor = contentAuthor,
        };

        var ownedBy = MapOwnedBy(linkDto.OwnedBy);
        var isShared = linkDetailsDto.Sharing is not null;
        var isSharedByUrl = linkDetailsDto.Sharing?.ShareUrlId is not null;

        var node = linkDetailsDto.Photo is { } photo
            ? new PhotoNode
            {
                Uid = uid,
                ParentUid = parentUid,
                Name = nameResult,
                NameAuthor = nameAuthor,
                KeyAuthor = nodeAuthor,
                CreationTime = linkDto.CreationTime,
                TrashTime = linkDto.TrashTime,
                MediaType = fileDto.MediaType,
                ActiveRevision = activeRevision,
                TotalStorageSize = fileDto.TotalSizeOnStorage,
                CaptureTime = photo.CaptureTime,
                AlbumUids = photo.AlbumInclusions.Select(a => new NodeUid(uid.VolumeId, a.Id)).ToList(),
                Tags = photo.Tags,
                RelatedPhotoUids = photo.RelatedPhotosLinkIds.Select(id => new NodeUid(uid.VolumeId, new LinkId(id))).ToList(),
                ContentHash = photo.ContentHash,
                OwnedBy = ownedBy,
                IsShared = isShared,
                IsSharedByUrl = isSharedByUrl,
                Errors = nodeErrors,
            }
            : new FileNode
            {
                Uid = uid,
                ParentUid = parentUid,
                Name = nameResult,
                NameAuthor = nameAuthor,
                KeyAuthor = nodeAuthor,
                CreationTime = linkDto.CreationTime,
                TrashTime = linkDto.TrashTime,
                MediaType = fileDto.MediaType,
                ActiveRevision = activeRevision,
                TotalStorageSize = fileDto.TotalSizeOnStorage,
                OwnedBy = ownedBy,
                IsShared = isShared,
                IsSharedByUrl = isSharedByUrl,
                Errors = nodeErrors,
            };

        var operationData = new FileOperationData
        {
            ParentUid = parentUid,
            Key = decryptionResult.Link.NodeKey.Merge(x => (PgpPrivateKey?)x, _ => null),
            PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
            NameSessionKey = nameSessionKey,
            ContentKey = decryptionResult.ContentKey.Merge(x => (PgpSessionKey?)x.Data, _ => null),
            PassphraseForAnonymousMove = decryptionResult.Link.Passphrase.Merge(
                x => decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous ? (ReadOnlyMemory<byte>?)x.Data : null,
                _ => null),
        };

        return new FileMetadataConversionResult(
            new FileMetadata(node, operationData, membershipDto?.ShareId, linkDto.NameHashDigest),
            failedDecryptionFields);
    }

    private static (List<ProtonDriveError> NodeErrors, Dictionary<EncryptedField, ProtonDriveError> FailedDecryptionFields) CollectFileDecryptionFailures(
        FileDecryptionResult decryptionResult,
        Result<string, ProtonDriveError> nameResult,
        Result<DateTime, ProtonDriveError>? modificationTimeResult)
    {
        Dictionary<EncryptedField, ProtonDriveError> failedDecryptionFields = [];
        List<ProtonDriveError> nodeErrors = [];

        if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
        {
            nodeErrors.Add(passphraseError);

            if (passphraseError is DecryptionError)
            {
                failedDecryptionFields.Add(EncryptedField.NodeKey, passphraseError);
            }
        }
        else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
        {
            nodeErrors.Add(nodeKeyError);

            if (nodeKeyError is DecryptionError)
            {
                failedDecryptionFields.Add(EncryptedField.NodeKey, nodeKeyError);
            }
        }
        else if (decryptionResult.ContentKey.TryGetError(out var contentKeyError))
        {
            failedDecryptionFields.Add(EncryptedField.NodeContentKey, contentKeyError);
        }

        if (nameResult.TryGetError(out var nameError))
        {
            failedDecryptionFields.Add(EncryptedField.NodeName, nameError);
        }

        if (modificationTimeResult?.TryGetError(out var modificationTimeError) == true)
        {
            nodeErrors.Add(new ExtendedAttributesDeserializationError("Could not read item's modification time", modificationTimeError));
        }

        if (decryptionResult.ExtendedAttributes.TryGetError(out var extendedAttributesError))
        {
            nodeErrors.Add(extendedAttributesError);

            if (extendedAttributesError is DecryptionError)
            {
                failedDecryptionFields.Add(EncryptedField.NodeExtendedAttributes, extendedAttributesError);
            }
        }

        return (nodeErrors, failedDecryptionFields);
    }

    private static FolderMetadataConversionResult BuildFolderMetadata(
        FolderDecryptionResult decryptionResult,
        Result<string, ProtonDriveError> nameResult,
        PgpSessionKey? nameSessionKey,
        NodeUid uid,
        NodeUid? parentUid,
        LinkDto linkDto,
        LinkSharingDto? sharing,
        ShareMembershipSummaryDto? membershipDto)
    {
        var (nodeErrors, failedDecryptionFields) = CollectFolderDecryptionFailures(decryptionResult, nameResult);

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

        var node = new FolderNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameResult,
            NameAuthor = nameAuthor,
            KeyAuthor = nodeAuthor,
            CreationTime = linkDto.CreationTime,
            TrashTime = linkDto.TrashTime,
            OwnedBy = MapOwnedBy(linkDto.OwnedBy),
            IsShared = sharing is not null,
            IsSharedByUrl = sharing?.ShareUrlId is not null,
            Errors = nodeErrors,
        };

        var operationData = new FolderOperationData
        {
            ParentUid = parentUid,
            Key = decryptionResult.Link.NodeKey.Merge(x => (PgpPrivateKey?)x, _ => null),
            PassphraseSessionKey = decryptionResult.Link.Passphrase.Merge(x => (PgpSessionKey?)x.SessionKey, _ => null),
            NameSessionKey = nameSessionKey,
            HashKey = decryptionResult.HashKey.Merge(x => (ReadOnlyMemory<byte>?)x.Data, _ => null),
            PassphraseForAnonymousMove = decryptionResult.Link.Passphrase.Merge(
                x => decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous ? (ReadOnlyMemory<byte>?)x.Data : null,
                _ => null),
        };

        return new FolderMetadataConversionResult(
            new FolderMetadata(node, operationData, membershipDto?.ShareId, linkDto.NameHashDigest),
            failedDecryptionFields);
    }

    private static (List<ProtonDriveError> NodeErrors, Dictionary<EncryptedField, ProtonDriveError> FailedDecryptionFields) CollectFolderDecryptionFailures(
        FolderDecryptionResult decryptionResult,
        Result<string, ProtonDriveError> nameResult)
    {
        Dictionary<EncryptedField, ProtonDriveError> failedDecryptionFields = [];
        List<ProtonDriveError> nodeErrors = [];

        if (decryptionResult.Link.Passphrase.TryGetError(out var passphraseError))
        {
            nodeErrors.Add(passphraseError);

            if (passphraseError is DecryptionError)
            {
                failedDecryptionFields.Add(EncryptedField.NodeKey, passphraseError);
            }
        }
        else if (decryptionResult.Link.NodeKey.TryGetError(out var nodeKeyError))
        {
            nodeErrors.Add(nodeKeyError);

            if (nodeKeyError is DecryptionError)
            {
                failedDecryptionFields.Add(EncryptedField.NodeKey, nodeKeyError);
            }
        }
        else if (decryptionResult.HashKey.TryGetError(out var hashKeyError))
        {
            nodeErrors.Add(hashKeyError);

            failedDecryptionFields.Add(EncryptedField.NodeHashKey, hashKeyError);
        }

        if (nameResult.TryGetError(out var nameError) && nameError is DecryptionError)
        {
            failedDecryptionFields.Add(EncryptedField.NodeName, nameError);
        }

        return (nodeErrors, failedDecryptionFields);
    }

    private static OwnedBy MapOwnedBy(OwnedByDto? dto) => new(dto?.Email, dto?.Organization);
}
