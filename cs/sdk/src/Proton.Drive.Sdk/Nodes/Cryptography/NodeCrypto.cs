using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Folders;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal static class NodeCrypto
{
    public static async ValueTask<FolderDecryptionResult> DecryptFolderAsync(
        ProtonDriveClient client,
        LinkDto link,
        FolderDto folder,
        ValResult<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var linkDecryptionResult = await DecryptLinkAsync(client, link, parentKeyResult, cancellationToken).ConfigureAwait(false);

        var hashKeyResult = DecryptHashKey(folder.HashKey, linkDecryptionResult.NodeKey.GetValueOrDefault(), linkDecryptionResult.NodeAuthorshipClaim);

        return new FolderDecryptionResult
        {
            Link = linkDecryptionResult,
            HashKey = hashKeyResult,
        };
    }

    public static async ValueTask<FileDecryptionResult> DecryptFileAsync(
        ProtonDriveClient client,
        LinkDto linkDto,
        FileDto fileDto,
        ActiveRevisionDto activeRevisionDto,
        ValResult<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var contentAuthorshipClaim =
            await AuthorshipClaim.CreateAsync(client, activeRevisionDto.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        var linkDecryptionResult = await DecryptLinkAsync(client, linkDto, parentKeyResult, cancellationToken).ConfigureAwait(false);

        var nodeKey = linkDecryptionResult.NodeKey.GetValueOrDefault();

        var contentKeyDecryptionResult = DecryptContentKey(
            nodeKey,
            fileDto.ContentKeyPacket,
            fileDto.ContentKeySignature,
            linkDecryptionResult.NodeAuthorshipClaim);

        var extendedAttributesResult = DecryptExtendedAttributes(activeRevisionDto.ExtendedAttributes, nodeKey, contentAuthorshipClaim);

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
        ProtonDriveClient client,
        LinkDto link,
        ValResult<PgpPrivateKey, ProtonDriveError> parentKeyResult,
        CancellationToken cancellationToken)
    {
        var nodeAuthorshipClaim = await AuthorshipClaim.CreateAsync(client, link.SignatureEmailAddress, cancellationToken).ConfigureAwait(false);

        var nameAuthorshipClaim = link.NameSignatureEmailAddress != link.SignatureEmailAddress
            ? await AuthorshipClaim.CreateAsync(client, link.NameSignatureEmailAddress, cancellationToken).ConfigureAwait(false)
            : nodeAuthorshipClaim;

        ValResult<PhasedDecryptionOutput<string>, string> nameResult;
        ValResult<PhasedDecryptionOutput<ReadOnlyMemory<byte>>, string> passphraseResult;

        if (parentKeyResult.TryGetValueElseError(out var parentKey, out var parentNodeKeyInnerError))
        {
            nameResult = DecryptName(link.Name, parentKey.Value, nameAuthorshipClaim);
            passphraseResult = DecryptPassphrase(parentKey.Value, link.Passphrase, link.PassphraseSignature, nodeAuthorshipClaim);
        }
        else
        {
            var errorMessage = parentNodeKeyInnerError.Message ?? "Decryption key unavailable";
            nameResult = errorMessage;
            passphraseResult = errorMessage;
        }

        var nodeKeyResult = UnlockNodeKey(link.Key, passphraseResult.GetValueOrDefault()?.Data);

        return new LinkDecryptionResult
        {
            Passphrase = passphraseResult,
            NodeAuthorshipClaim = nodeAuthorshipClaim,
            Name = nameResult,
            NameAuthorshipClaim = nameAuthorshipClaim,
            NodeKey = nodeKeyResult,
        };
    }

    private static ValResult<PhasedDecryptionOutput<ReadOnlyMemory<byte>>, string> DecryptPassphrase(
        PgpPrivateKey parentNodeKey,
        PgpArmoredMessage encryptedPassphrase,
        PgpArmoredSignature? signature,
        AuthorshipClaim authorshipClaim)
    {
        try
        {
            var passphrase = DecryptMessage(encryptedPassphrase, signature, parentNodeKey, authorshipClaim, out var sessionKey, out var author);

            return new PhasedDecryptionOutput<ReadOnlyMemory<byte>>(sessionKey, passphrase, author);
        }
        catch (Exception e)
        {
            return e.Message;
        }
    }

    private static ValResult<PgpPrivateKey, string?> UnlockNodeKey(PgpArmoredPrivateKey lockedKey, ReadOnlyMemory<byte>? passphrase)
    {
        if (passphrase is null)
        {
            return null;
        }

        try
        {
            return PgpPrivateKey.ImportAndUnlock(lockedKey, passphrase.Value.Span);
        }
        catch (Exception e)
        {
            return e.Message;
        }
    }

    private static ValResult<PhasedDecryptionOutput<string>, string> DecryptName(
        PgpArmoredMessage encryptedName,
        PgpPrivateKey parentNodeKey,
        AuthorshipClaim authorshipClaim)
    {
        try
        {
            var nameUtf8Bytes = DecryptMessage(encryptedName, detachedSignature: null, parentNodeKey, authorshipClaim, out var sessionKey, out var author);

            var name = Encoding.UTF8.GetString(nameUtf8Bytes);

            return new PhasedDecryptionOutput<string>(sessionKey, name, author);
        }
        catch (Exception e)
        {
            return e.Message;
        }
    }

    private static ValResult<DecryptionOutput<ReadOnlyMemory<byte>>, string?> DecryptHashKey(
        PgpArmoredMessage? encryptedHashKey,
        PgpPrivateKey? nodeKey,
        AuthorshipClaim authorshipClaim)
    {
        if (nodeKey is null)
        {
            return null;
        }

        if (encryptedHashKey is null)
        {
            return "Folder information missing for link of type Folder";
        }

        try
        {
            var hashKey = DecryptMessage(encryptedHashKey.Value, detachedSignature: null, nodeKey.Value, authorshipClaim, out _, out var author);

            return new DecryptionOutput<ReadOnlyMemory<byte>>(hashKey, author);
        }
        catch (Exception e)
        {
            return e.Message;
        }
    }

    private static ValResult<DecryptionOutput<PgpSessionKey>, string?> DecryptContentKey(
        PgpPrivateKey? nodeKey,
        ReadOnlyMemory<byte> contentKeyPacket,
        PgpArmoredSignature contentKeySignature,
        AuthorshipClaim nodeAuthorshipClaim)
    {
        if (nodeKey is null)
        {
            return null;
        }

        PgpSessionKey contentKey;
        try
        {
            contentKey = nodeKey.Value.DecryptSessionKey(contentKeyPacket.Span);
        }
        catch (Exception e)
        {
            return e.Message;
        }

        var verificationKeyRing = nodeAuthorshipClaim.GetKeyRing(nodeKey.Value);

        AuthorshipVerificationFailure? verificationFailure;
        try
        {
            var verificationResult = verificationKeyRing.Verify(contentKey.Export().Token, contentKeySignature);

            verificationFailure = verificationResult.Status is not PgpVerificationStatus.Ok
                ? new AuthorshipVerificationFailure(verificationResult.Status)
                : null;
        }
        catch (Exception e)
        {
            verificationFailure = new AuthorshipVerificationFailure(PgpVerificationStatus.Failed, e.Message);
        }

        return new DecryptionOutput<PgpSessionKey>(contentKey, verificationFailure);
    }

    private static ValResult<DecryptionOutput<ExtendedAttributes?>, string?> DecryptExtendedAttributes(
        PgpArmoredMessage? encryptedExtendedAttributes,
        PgpPrivateKey? nodeKey,
        AuthorshipClaim authorshipClaim)
    {
        if (encryptedExtendedAttributes is null)
        {
            return new DecryptionOutput<ExtendedAttributes?>(null);
        }

        if (nodeKey is null)
        {
            return null;
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

                return new DecryptionOutput<ExtendedAttributes?>(extendedAttributes, author);
            }
            catch (Exception e)
            {
                return $"Failed to deserialize extended attributes: {e.Message}";
            }
        }
        catch (Exception e)
        {
            return e.Message;
        }
    }

    private static ArraySegment<byte> DecryptMessage(
        PgpArmoredMessage encryptedMessage,
        PgpArmoredSignature? detachedSignature,
        PgpPrivateKey decryptionKey,
        AuthorshipClaim authorshipClaim,
        out PgpSessionKey sessionKey,
        out AuthorshipVerificationFailure? authorshipVerificationFailure)
    {
        sessionKey = decryptionKey.DecryptSessionKey(encryptedMessage);

        var verificationKeyRing = authorshipClaim.GetKeyRing(anonymousFallbackKey: decryptionKey);

        var plaintext = detachedSignature is not null
            ? sessionKey.DecryptAndVerify(encryptedMessage.Bytes.Span, detachedSignature.Value.Bytes.Span, verificationKeyRing, out var verificationResult)
            : sessionKey.DecryptAndVerify(encryptedMessage, verificationKeyRing, out verificationResult);

        authorshipVerificationFailure = verificationResult.Status is not PgpVerificationStatus.Ok
            ? new AuthorshipVerificationFailure(verificationResult.Status)
            : null;

        return plaintext;
    }
}
