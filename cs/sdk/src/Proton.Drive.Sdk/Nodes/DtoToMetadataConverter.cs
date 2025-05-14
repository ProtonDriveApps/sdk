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
    public static async Task<ValResult<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
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
            linkDetailsDto.Membership?.ShareId,
            cancellationToken).ConfigureAwait(false);

        return await ConvertDtoToNodeMetadataAsync(client, volumeId, linkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false);
    }

    public static async Task<ValResult<NodeMetadata, DegradedNodeMetadata>> ConvertDtoToNodeMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        ValResult<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkType = linkDetailsDto.Link.Type;

        return linkType switch
        {
            LinkType.Folder =>
                (await ConvertDtoToFolderMetadataAsync(client, volumeId, linkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false))
                .ConvertVal(NodeMetadata.FromFolder, DegradedNodeMetadata.FromFolder),

            LinkType.File =>
                (await ConvertDtoToFileMetadataAsync(client, volumeId, linkDetailsDto, parentKeyResult, cancellationToken).ConfigureAwait(false))
                .ConvertVal(NodeMetadata.FromFile, DegradedNodeMetadata.FromFile),

            // FIXME: handle other existing node types, and determine a way for forward compatibility or degraded result in case a new node type is introduced
            _ => throw new NotSupportedException($"Link type {linkType} is not supported."),
        };
    }

    public static async ValueTask<ValResult<FolderMetadata, DegradedFolderMetadata>> ConvertDtoToFolderMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        ValResult<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var (linkDto, folderDto, _, membershipDto) = linkDetailsDto;

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
                IsTrashed = linkDto.State is LinkState.Trashed,
                Author = default,
                Errors = null!, // FIXME
            };

            // FIXME: cache secrets
            var degradedSecrets = new DegradedFolderSecrets
            {
                Key = decryptionResult.Link.NodeKey.GetValueOrDefault(),
                PassphraseSessionKey = decryptionResult.Link.Passphrase.GetValueOrDefault()?.SessionKey,
                NameSessionKey = nameSessionKey,
                HashKey = decryptionResult.HashKey.GetValueOrDefault()?.Data,
            };

            throw new NotImplementedException();
        }

        var secrets = new FolderSecrets
        {
            Key = nodeKey.Value,
            PassphraseSessionKey = passphraseOutput.Value.SessionKey,
            NameSessionKey = nameSessionKey.Value,
            HashKey = hashKeyOutput.Value.Data,
            PassphraseForAnonymousMove = decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous ? passphraseOutput.Value.Data : null,
        };

        await client.Cache.Secrets.SetFolderSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        var node = new FolderNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameOutput.Value.Data,
            NameAuthor = decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure),

            // FIXME: combine with verification failure from name hash key
            Author = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.Value.AuthorshipVerificationFailure),
            IsTrashed = linkDto.State is LinkState.Trashed,
        };

        await client.Cache.Entities.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FolderMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    public static async Task<ValResult<FileMetadata, DegradedFileMetadata>> ConvertDtoToFileMetadataAsync(
        ProtonDriveClient client,
        VolumeId volumeId,
        LinkDetailsDto linkDetailsDto,
        ValResult<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var (linkDto, _, fileDto, membershipDto) = linkDetailsDto;

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
                IsTrashed = linkDto.State is LinkState.Trashed,
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
                PassphraseSessionKey = decryptionResult.Link.Passphrase.GetValueOrDefault()?.SessionKey,
                NameSessionKey = nameSessionKey,
                ContentKey = decryptionResult.ContentKey.GetValueOrDefault()?.Data,
            };

            throw new NotImplementedException();
        }

        var secrets = new FileSecrets
        {
            Key = nodeKey.Value,
            PassphraseSessionKey = passphraseOutput.Value.SessionKey,
            NameSessionKey = nameSessionKey.Value,
            ContentKey = contentKeyOutput.Value.Data,
            PassphraseForAnonymousMove = decryptionResult.Link.NodeAuthorshipClaim.Author == Author.Anonymous
                ? passphraseOutput.Value.Data
                : (ReadOnlyMemory<byte>?)null,
        };

        await client.Cache.Secrets.SetFileSecretsAsync(uid, secrets, cancellationToken).ConfigureAwait(false);

        var extendedAttributes = extendedAttributesOutput.Value.Data;

        var node = new FileNode
        {
            Uid = uid,
            ParentUid = parentUid,
            Name = nameOutput.Value.Data,
            NameAuthor = decryptionResult.Link.NameAuthorshipClaim.ToAuthorshipResult(nameOutput.Value.AuthorshipVerificationFailure),

            // FIXME: combine with verification failure from name hash key
            Author = decryptionResult.Link.NodeAuthorshipClaim.ToAuthorshipResult(passphraseOutput.Value.AuthorshipVerificationFailure),
            IsTrashed = linkDto.State is LinkState.Trashed,
            MediaType = fileDto.MediaType,
            ActiveRevision = new Revision
            {
                Uid = new RevisionUid(uid, activeRevisionDto.Id),
                CreationTime = activeRevisionDto.CreationTime,
                StorageQuotaConsumption = activeRevisionDto.StorageQuotaConsumption,
                ClaimedSize = extendedAttributes?.Common?.Size,
                ClaimedModificationTime = extendedAttributes?.Common?.ModificationTime,
                Thumbnails = [], // FIXME: thumbnails
                ContentAuthor = decryptionResult.ContentAuthorshipClaim.ToAuthorshipResult(extendedAttributesOutput.Value.AuthorshipVerificationFailure),
            },
            TotalStorageQuotaUsage = fileDto.TotalStorageQuotaUsage,
        };

        await client.Cache.Entities.SetNodeAsync(uid, node, membershipDto?.ShareId, linkDto.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new FileMetadata(node, secrets, membershipDto?.ShareId, linkDto.NameHashDigest);
    }

    private static async ValueTask<ValResult<PgpPrivateKey, ProtonDriveError>> GetParentKeyAsync(
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
