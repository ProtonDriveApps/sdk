using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeCrypto
{
    public static async ValueTask<Result<NodeAndSecrets, DegradedNodeAndSecrets>> DecryptNodeAsync(
        ProtonDriveClient client,
        NodeUid id,
        LinkDetailsDto linkDetails,
        Result<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var (link, folder, file, membership) = linkDetails;

        var parentId = link.ParentId is not null ? new NodeUid(id.VolumeId, link.ParentId.Value) : (NodeUid?)null;

        var nodeAuthorshipClaim = await AuthorshipClaim.CreateAsync(client, link.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        var nameAuthorshipClaim = link.NameSignatureEmailAddress != link.SignatureEmailAddress
            ? await AuthorshipClaim.CreateAsync(client, link.NameSignatureEmailAddress, cancellationToken).ConfigureAwait(false)
            : nodeAuthorshipClaim;

        Result<PhasedDecryptionOutput<string>, ProtonDriveError> nameResult;
        PhasedDecryptionOutput<ReadOnlyMemory<byte>>? passphraseOutput;
        DecryptionError? passphraseError;
        ProtonDriveError? parentKeyError;

        if (parentKeyResult.TryGetValueElseError(out var parentKey, out var parentNodeKeyInnerError))
        {
            nameResult = DecryptName(link.Name, parentKey, nameAuthorshipClaim);

            (passphraseOutput, passphraseError) = DecryptPassphrase(parentKey, link.Passphrase, link.PassphraseSignature, nodeAuthorshipClaim);
        }
        else
        {
            parentKeyError = new ProtonDriveError("Decryption key unavailable", parentNodeKeyInnerError);

            nameResult = parentKeyError;
            passphraseOutput = null;
            passphraseError = null;
        }

        var nameOutput = nameResult.GetValueOrDefault();

        var (nodeKey, nodeKeyError) = UnlockNodeKey(link.Key, passphraseOutput?.Data);

        if (link.Type is LinkType.Folder)
        {
            var (hashKeyOutput, hashKeyError) = DecryptHashKey(folder?.HashKey, nodeKey, nodeAuthorshipClaim);

            if (nameOutput is null || nodeKey is null || passphraseOutput is null || hashKeyOutput is null)
            {
                var degradedFolderNode = new DegradedFolderNode
                {
                    Id = id,
                    ParentId = parentId,
                    Name = nameResult.Convert(x => x.Data),
                    NameAuthor = null!,
                    IsTrashed = link.State is LinkState.Trashed,
                    Author = null!,
                    Errors = null!,
                };

                var degradedFolderSecrets = new DegradedFolderSecrets
                {
                    HashKey = hashKeyOutput?.Data,
                    Key = nodeKey,
                    NameSessionKey = nameOutput?.SessionKey,
                    PassphraseSessionKey = passphraseOutput?.SessionKey,
                };

                // TODO: cache secrets
                throw new NotImplementedException();
            }

            var folderSecrets = new FolderSecrets
            {
                HashKey = hashKeyOutput.Value.Data,
                Key = nodeKey.Value,
                NameSessionKey = nameOutput.Value.SessionKey,
                PassphraseSessionKey = passphraseOutput.Value.SessionKey,
            };

            await client.Cache.Secrets.SetFolderSecretsAsync(id, folderSecrets, cancellationToken).ConfigureAwait(false);

            var folderNode = new FolderNode
            {
                Id = id,
                ParentId = parentId,
                Name = nameOutput.Value.Data,
                NameAuthor = nameOutput.Value.Author,
                Author = passphraseOutput.Value.Author, // TODO: combine with signature error from name hash key
                IsTrashed = link.State is LinkState.Trashed,
            };

            await client.Cache.Entities.SetNodeAsync(id, folderNode, membership?.ShareId, link.NameHashDigest, cancellationToken).ConfigureAwait(false);

            return new NodeAndSecrets(folderNode, folderSecrets);
        }

        if (file is null)
        {
            // TODO: handle missing file information with degraded node
            throw new NotImplementedException();
        }

        if (link.State is LinkState.Draft)
        {
            // We don't currently expect draft nodes
            throw new NotSupportedException();
        }

        if (file.ActiveRevision is null)
        {
            // TODO: handle missing revision information with degraded node
            throw new NotImplementedException();
        }

        var contentKey = nodeKey?.DecryptSessionKey(file.ContentKeyPacket.Span);

        // TODO: verify content key packet signature

        var (extendedAttributesOutput, extendedAttributesError) =
            DecryptExtendedAttributes(file.ActiveRevision.ExtendedAttributes, nodeKey, nodeAuthorshipClaim);

        if (nameOutput is null || nodeKey is null || passphraseOutput is null || contentKey is null || extendedAttributesError is not null)
        {
            var degradedFileNode = new DegradedFileNode
            {
                Id = default,
                ParentId = null,
                Name = nameResult.Convert(x => x.Data),
                NameAuthor = default,
                IsTrashed = false,
                Author = default,
                MediaType = file.MediaType,
                ActiveRevision = null,
                TotalStorageQuotaUsage = file.TotalStorageQuotaUsage,
                Errors = null!,
            };

            var degradedFileSecrets = new DegradedFileSecrets
            {
                Key = nodeKey,
                PassphraseSessionKey = passphraseOutput?.SessionKey,
                NameSessionKey = nameOutput?.SessionKey,
                ContentKey = contentKey,
            };

            // TODO: cache secrets
            throw new NotImplementedException();
        }

        var fileSecrets = new FileSecrets
        {
            Key = nodeKey.Value,
            PassphraseSessionKey = passphraseOutput.Value.SessionKey,
            NameSessionKey = nameOutput.Value.SessionKey,
            ContentKey = contentKey.Value,
        };

        await client.Cache.Secrets.SetFileSecretsAsync(id, fileSecrets, cancellationToken).ConfigureAwait(false);

        var extendedAttributes = extendedAttributesOutput?.Data;

        var fileNode = new FileNode
        {
            Id = id,
            ParentId = parentId,
            Name = nameOutput.Value.Data,
            IsTrashed = link.State is LinkState.Trashed,
            NameAuthor = nameOutput.Value.Author,
            Author = passphraseOutput.Value.Author, // TODO: combine with signature error from content key
            MediaType = file.MediaType,
            ActiveRevision = new Revision
            {
                Id = file.ActiveRevision.Id,
                CreationTime = file.ActiveRevision.CreationTime,
                StorageQuotaConsumption = file.ActiveRevision.StorageQuotaConsumption,
                ClaimedSize = extendedAttributes?.Common?.Size,
                ClaimedModificationTime = extendedAttributes?.Common?.ModificationTime,
                Thumbnails = [], // TODO: thumbnails
                MetadataAuthor = extendedAttributesOutput?.Author,
            },
            TotalStorageQuotaUsage = file.TotalStorageQuotaUsage,
        };

        await client.Cache.Entities.SetNodeAsync(id, fileNode, membership?.ShareId, link.NameHashDigest, cancellationToken).ConfigureAwait(false);

        return new NodeAndSecrets(fileNode, fileSecrets);
    }

    public static byte[] HashNodeName(string name, ReadOnlySpan<byte> parentFolderHashKey)
    {
        var maxNameByteLength = Encoding.UTF8.GetByteCount(name);
        var nameBytes = MemoryProvider.GetHeapMemoryIfTooLargeForStack<byte>(maxNameByteLength, out var nameHeapMemoryOwner)
            ? nameHeapMemoryOwner.Memory.Span
            : stackalloc byte[maxNameByteLength];

        using (nameHeapMemoryOwner)
        {
            var nameByteLength = Encoding.UTF8.GetBytes(name, nameBytes);
            nameBytes = nameBytes[..nameByteLength];

            return HMACSHA256.HashData(parentFolderHashKey, nameBytes);
        }
    }

    private static (PhasedDecryptionOutput<ReadOnlyMemory<byte>>? Output, DecryptionError? Error) DecryptPassphrase(
        PgpPrivateKey parentNodeKey,
        PgpArmoredMessage encryptedPassphrase,
        PgpArmoredSignature? signature,
        AuthorshipClaim authorshipClaim)
    {
        try
        {
            var passphrase = DecryptMessage(encryptedPassphrase, signature, parentNodeKey, authorshipClaim, out var sessionKey, out var author);

            return (new PhasedDecryptionOutput<ReadOnlyMemory<byte>>(sessionKey, passphrase, author), null);
        }
        catch (Exception e)
        {
            return (null, new DecryptionError(e.Message, authorshipClaim.Author));
        }
    }

    private static (PgpPrivateKey? NodeKey, string? ErrorMessage) UnlockNodeKey(PgpArmoredPrivateKey lockedKey, ReadOnlyMemory<byte>? passphrase)
    {
        if (passphrase is null)
        {
            return (null, null);
        }

        try
        {
            var nodeKey = PgpPrivateKey.ImportAndUnlock(lockedKey, passphrase.Value.Span);

            return (nodeKey, null);
        }
        catch (Exception e)
        {
            return (null, e.Message);
        }
    }

    private static (DecryptionOutput<ReadOnlyMemory<byte>>? Output, DecryptionError? Error) DecryptHashKey(
        PgpArmoredMessage? encryptedHashKey,
        PgpPrivateKey? nodeKey,
        AuthorshipClaim authorshipClaim)
    {
        if (nodeKey is null)
        {
            return (Output: null, Error: null);
        }

        if (encryptedHashKey is null)
        {
            return (Output: null, new DecryptionError("Folder information missing for link of type Folder", authorshipClaim.Author));
        }

        try
        {
            var hashKey = DecryptMessage(encryptedHashKey.Value, detachedSignature: null, nodeKey.Value, authorshipClaim, out _, out var author);

            return ((hashKey, author), null);
        }
        catch (Exception e)
        {
            return (Output: null, new DecryptionError(e.Message, authorshipClaim.Author));
        }
    }

    private static Result<PhasedDecryptionOutput<string>, ProtonDriveError> DecryptName(
        PgpArmoredMessage encryptedName,
        PgpPrivateKey parentNodeKey,
        AuthorshipClaim authorshipClaim)
    {
        try
        {
            var nameUtf8Bytes = DecryptMessage(encryptedName, detachedSignature: null, parentNodeKey, authorshipClaim, out var sessionKey, out var author);

            var name = Encoding.UTF8.GetString(nameUtf8Bytes);

            return ValidateName(name, author, out var invalidNameError)
                ? new PhasedDecryptionOutput<string>(sessionKey, name, author)
                : invalidNameError;
        }
        catch (Exception e)
        {
            return new DecryptionError(e.Message, authorshipClaim.Author);
        }
    }

    private static (DecryptionOutput<ExtendedAttributes>? Output, DecryptionError? Error) DecryptExtendedAttributes(
        PgpArmoredMessage? encryptedExtendedAttributes,
        PgpPrivateKey? nodeKey,
        AuthorshipClaim authorshipClaim)
    {
        if (encryptedExtendedAttributes is null)
        {
            return (Output: null, Error: null);
        }

        if (nodeKey is null)
        {
            return (Output: null, Error: null);
        }

        try
        {
            var serializedExtendedAttributes = DecryptMessage(
                encryptedExtendedAttributes.Value,
                detachedSignature: null,
                nodeKey.Value,
                authorshipClaim,
                out _,
                out var author);

            try
            {
                var extendedAttributes = JsonSerializer.Deserialize(serializedExtendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

                return ((extendedAttributes, author), Error: null);
            }
            catch (Exception e)
            {
                return (Output: null, new DecryptionError($"Failed to deserialize extended attributes: {e.Message}", authorshipClaim.Author));
            }
        }
        catch (Exception e)
        {
            return (Output: null, new DecryptionError(e.Message, authorshipClaim.Author));
        }
    }

    private static ArraySegment<byte> DecryptMessage(
        PgpArmoredMessage encryptedMessage,
        PgpArmoredSignature? detachedSignature,
        PgpPrivateKey decryptionKey,
        AuthorshipClaim authorshipClaim,
        out PgpSessionKey sessionKey,
        out Result<Author, SignatureVerificationError> author)
    {
        sessionKey = decryptionKey.DecryptSessionKey(encryptedMessage);

        var verificationKeyRing = authorshipClaim.GetKeyRing(anonymousFallbackKey: decryptionKey);

        var plaintext = detachedSignature is not null
            ? sessionKey.DecryptAndVerify(encryptedMessage.Bytes.Span, detachedSignature.Value.Bytes.Span, verificationKeyRing, out var verificationResult)
            : sessionKey.DecryptAndVerify(encryptedMessage, verificationKeyRing, out verificationResult);

        author = authorshipClaim.ToAuthorshipResult(verificationResult);

        return plaintext;
    }

    // TODO: find a more suitable place to put this validation than in a class that claims to be about cryptography
    private static bool ValidateName(string name, Result<Author, SignatureVerificationError> author, [MaybeNullWhen(true)] out InvalidNameError error)
    {
        if (string.IsNullOrEmpty(name))
        {
            error = new InvalidNameError(name, author, "Name must not be empty");
            return false;
        }

        if (name.Contains('/'))
        {
            error = new InvalidNameError(name, author, "Name must not contain the character '/'");
            return false;
        }

        error = null;
        return true;
    }
}
