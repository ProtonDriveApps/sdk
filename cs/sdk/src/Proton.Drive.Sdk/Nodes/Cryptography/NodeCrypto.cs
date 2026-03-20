using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal static class NodeCrypto
{
    public static async ValueTask<FolderDecryptionResult> DecryptFolderAsync(
        IAccountClient accountClient,
        LinkDto link,
        PgpArmoredMessage folderHashKey,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        var linkDecryptionResult = await DecryptLinkAsync(accountClient, link, parentKey, cancellationToken).ConfigureAwait(false);

        var hashKeyResult = DecryptHashKey(folderHashKey, linkDecryptionResult.NodeKey, linkDecryptionResult.NodeAuthorshipClaim);

        return new FolderDecryptionResult
        {
            Link = linkDecryptionResult,
            HashKey = hashKeyResult,
        };
    }

    public static async ValueTask<FileDecryptionResult> DecryptFileAsync(
        IAccountClient accountClient,
        LinkDto linkDto,
        FileDto fileDto,
        ActiveRevisionDto activeRevisionDto,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        var contentAuthorshipClaim =
            await AuthorshipClaim.CreateAsync(accountClient, activeRevisionDto.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        var linkDecryptionResult = await DecryptLinkAsync(accountClient, linkDto, parentKey, cancellationToken).ConfigureAwait(false);

        var contentKeyDecryptionResult = DecryptContentKey(
            linkDecryptionResult.NodeKey,
            fileDto.ContentKeyPacket,
            fileDto.ContentKeySignature,
            linkDecryptionResult.NodeAuthorshipClaim);

        var extendedAttributesResult = DecryptExtendedAttributes(
            activeRevisionDto.ExtendedAttributes,
            linkDecryptionResult.NodeKey,
            contentAuthorshipClaim);

        return new FileDecryptionResult
        {
            Link = linkDecryptionResult,
            ContentKey = contentKeyDecryptionResult,
            ExtendedAttributes = extendedAttributesResult,
            ContentAuthorshipClaim = contentAuthorshipClaim,
        };
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

    private static async ValueTask<LinkDecryptionResult> DecryptLinkAsync(
        IAccountClient accountClient,
        LinkDto link,
        PgpPrivateKey parentKey,
        CancellationToken cancellationToken)
    {
        var nodeAuthorshipClaim = await AuthorshipClaim.CreateAsync(accountClient, link.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        var nameAuthorshipClaim = link.NameSignatureEmailAddress != link.SignatureEmailAddress
            ? await AuthorshipClaim.CreateAsync(accountClient, link.NameSignatureEmailAddress, cancellationToken).ConfigureAwait(false)
            : nodeAuthorshipClaim;

        var nameResult = DecryptName(link.Name, parentKey, nameAuthorshipClaim);
        var passphraseResult = DecryptPassphrase(parentKey, link.Passphrase, link.PassphraseSignature, nodeAuthorshipClaim);

        var nodeKeyResult = UnlockNodeKey(link.Key, passphraseResult);

        return new LinkDecryptionResult
        {
            Passphrase = passphraseResult,
            NodeAuthorshipClaim = nodeAuthorshipClaim,
            Name = nameResult,
            NameAuthorshipClaim = nameAuthorshipClaim,
            NodeKey = nodeKeyResult,
        };
    }

    private static Result<PhasedDecryptionOutput<ReadOnlyMemory<byte>>, ProtonDriveError> DecryptPassphrase(
        PgpPrivateKey parentNodeKey,
        PgpArmoredMessage encryptedPassphrase,
        PgpArmoredSignature? signature,
        AuthorshipClaim authorshipClaim)
    {
        try
        {
            var passphrase = DecryptMessage(
                encryptedPassphrase,
                signature,
                parentNodeKey,
                authorshipClaim.GetKeyRing(parentNodeKey),
                out var sessionKey,
                out var author);

            return new PhasedDecryptionOutput<ReadOnlyMemory<byte>>(sessionKey, passphrase, author);
        }
        catch (Exception e)
        {
            return new ProtonDriveError("Failed to decrypt passphrase", e.ToProtonDriveError());
        }
    }

    private static Result<PgpPrivateKey, ProtonDriveError> UnlockNodeKey(
        PgpArmoredPrivateKey lockedKey,
        Result<PhasedDecryptionOutput<ReadOnlyMemory<byte>>, ProtonDriveError> passphraseResult)
    {
        if (!passphraseResult.TryGetValueElseError(out var passphrase, out var error))
        {
            return new ProtonDriveError("Cannot get passphrase", error);
        }

        try
        {
            return PgpPrivateKey.ImportAndUnlock(lockedKey, passphrase.Data.Span);
        }
        catch (Exception e)
        {
            return new ProtonDriveError("Failed to import and unlock passphrase", e.ToProtonDriveError());
        }
    }

    private static Result<PhasedDecryptionOutput<string>, ProtonDriveError> DecryptName(
        PgpArmoredMessage encryptedName,
        PgpPrivateKey parentNodeKey,
        AuthorshipClaim authorshipClaim)
    {
        try
        {
            var nameUtf8Bytes = DecryptMessage(
                encryptedName,
                detachedSignature: null,
                parentNodeKey,
                authorshipClaim.GetKeyRing(parentNodeKey),
                out var sessionKey,
                out var author);

            var name = Encoding.UTF8.GetString(nameUtf8Bytes);

            return new PhasedDecryptionOutput<string>(sessionKey, name, author);
        }
        catch (Exception e)
        {
            return new ProtonDriveError("Failed to decrypt name", e.ToProtonDriveError());
        }
    }

    private static Result<DecryptionOutput<ReadOnlyMemory<byte>>, ProtonDriveError> DecryptHashKey(
        PgpArmoredMessage encryptedHashKey,
        Result<PgpPrivateKey, ProtonDriveError> nodeKeyResult,
        AuthorshipClaim authorshipClaim)
    {
        if (!nodeKeyResult.TryGetValueElseError(out var nodeKey, out var error))
        {
            return new ProtonDriveError("Cannot decrypt hash key without node key", error);
        }

        try
        {
            var verificationKeyRing = GetContentKeyAndHashKeyVerificationKeyRing(nodeKey, authorshipClaim);
            var hashKey = DecryptMessage(encryptedHashKey, detachedSignature: null, nodeKey, verificationKeyRing, out _, out var author);
            return new DecryptionOutput<ReadOnlyMemory<byte>>(hashKey, author);
        }
        catch (Exception e)
        {
            return new ProtonDriveError("Failed to decrypt hash key", e.ToProtonDriveError());
        }
    }

    private static PgpKeyRing GetContentKeyAndHashKeyVerificationKeyRing(PgpPrivateKey nodeKey, AuthorshipClaim authorshipClaim)
    {
        var keys = new List<PgpKey>([nodeKey]);
        if (authorshipClaim.Author != Author.Anonymous)
        {
            keys.AddRange(authorshipClaim.Keys.AsEnumerable().Select(k => new PgpKey(k)));
        }

        var keyRing = new PgpKeyRing(keys);
        return keyRing;
    }

    private static Result<DecryptionOutput<PgpSessionKey>, ProtonDriveError> DecryptContentKey(
        Result<PgpPrivateKey, ProtonDriveError> nodeKeyResult,
        ReadOnlyMemory<byte> contentKeyPacket,
        PgpArmoredSignature? contentKeySignature,
        AuthorshipClaim nodeAuthorshipClaim)
    {
        if (!nodeKeyResult.TryGetValueElseError(out var nodeKey, out var error))
        {
            return new ProtonDriveError("Cannot get node key", error);
        }

        PgpSessionKey contentKey;
        try
        {
            contentKey = nodeKey.DecryptSessionKey(contentKeyPacket.Span);
        }
        catch (Exception e)
        {
            return new ProtonDriveError("Cannot decrypt session key", e.ToProtonDriveError());
        }

        var verificationKeyRing = GetContentKeyAndHashKeyVerificationKeyRing(nodeKey, nodeAuthorshipClaim);

        AuthorshipVerificationFailure? verificationFailure;
        try
        {
            var verificationStatus = contentKeySignature is not null
                ? verificationKeyRing.Verify(contentKey.Export(), contentKeySignature.Value).Status
                : PgpVerificationStatus.NotSigned;

            verificationFailure = verificationStatus is not PgpVerificationStatus.Ok
                ? new AuthorshipVerificationFailure(verificationStatus)
                : null;
        }
        catch (Exception e)
        {
            verificationFailure = new AuthorshipVerificationFailure(PgpVerificationStatus.Failed, e.ToProtonDriveError());
        }

        return new DecryptionOutput<PgpSessionKey>(contentKey, verificationFailure);
    }

    private static Result<DecryptionOutput<ExtendedAttributes?>, ProtonDriveError> DecryptExtendedAttributes(
        PgpArmoredMessage? encryptedExtendedAttributes,
        Result<PgpPrivateKey, ProtonDriveError> nodeKeyResult,
        AuthorshipClaim authorshipClaim)
    {
        if (encryptedExtendedAttributes is null)
        {
            return new DecryptionOutput<ExtendedAttributes?>(null);
        }

        if (!nodeKeyResult.TryGetValueElseError(out var nodeKey, out var error))
        {
            return new ProtonDriveError("Cannot get node key", error);
        }

        try
        {
            var serializedExtendedAttributes = DecryptMessage(
                encryptedExtendedAttributes.Value,
                detachedSignature: null,
                nodeKey,
                authorshipClaim.GetKeyRing(nodeKey),
                out _,
                out var author);

            try
            {
                var extendedAttributes = JsonSerializer.Deserialize(serializedExtendedAttributes, DriveApiSerializerContext.Default.ExtendedAttributes);

                return new DecryptionOutput<ExtendedAttributes?>(extendedAttributes, author);
            }
            catch (Exception e)
            {
                return new ProtonDriveError("Failed to deserialize extended attributes", e.ToProtonDriveError());
            }
        }
        catch (Exception e)
        {
            return new ProtonDriveError("Failed to decrypt extended attributes", e.ToProtonDriveError());
        }
    }

    private static ArraySegment<byte> DecryptMessage(
        PgpArmoredMessage encryptedMessage,
        PgpArmoredSignature? detachedSignature,
        PgpPrivateKey decryptionKey,
        PgpKeyRing verificationKeyRing,
        out PgpSessionKey sessionKey,
        out AuthorshipVerificationFailure? authorshipVerificationFailure)
    {
        sessionKey = decryptionKey.DecryptSessionKey(encryptedMessage);

        var plaintext = detachedSignature is not null
            ? sessionKey.DecryptAndVerify(encryptedMessage.Bytes.Span, detachedSignature.Value.Bytes.Span, verificationKeyRing, out var verificationResult)
            : sessionKey.DecryptAndVerify(encryptedMessage, verificationKeyRing, out verificationResult);

        authorshipVerificationFailure = verificationResult.Status is not PgpVerificationStatus.Ok
            ? new AuthorshipVerificationFailure(verificationResult.Status)
            : null;

        return plaintext;
    }
}
