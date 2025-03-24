using System.Security.Cryptography;
using System.Text;
using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Drive;

namespace Proton.Drive.Sdk.Nodes;

internal static class NodeCrypto
{
    public static async ValueTask<Result<Node, DecryptionError>> DecryptNodeAsync(
        ProtonDriveClient client,
        NodeUid nodeId,
        LinkDto link,
        FolderDto? folder,
        PgpPrivateKey parentNodeKey,
        CancellationToken cancellationToken)
    {
        var state = (NodeState)link.State;

        var passphraseClaimedAuthor = new Author(link.SignatureEmailAddress);
        var nameClaimedAuthor = new Author(link.NameSignatureEmailAddress);

        var passphraseDecryptionResult = await DecryptPassphraseAsync(
            client,
            parentNodeKey,
            link.Passphrase,
            link.PassphraseSignature,
            passphraseClaimedAuthor,
            cancellationToken).ConfigureAwait(false);

        if (!passphraseDecryptionResult.TryGetValue(out var passphraseSessionKeyAndData, out var passphraseDecryptionError))
        {
            return passphraseDecryptionError;
        }

        var (passphraseSessionKey, passphraseDataDecryptionResult) = passphraseSessionKeyAndData;

        if (!passphraseDataDecryptionResult.TryGetValue(out var passphraseDataAndAuthor, out passphraseDecryptionError))
        {
            return passphraseDecryptionError;
        }

        var (passphrase, passphraseAuthor) = passphraseDataAndAuthor;

        var nameDecryptionResult = await DecryptNameAsync(client, parentNodeKey, link.Name, nameClaimedAuthor, cancellationToken).ConfigureAwait(false);

        PgpSessionKey? nameSessionKey;
        Result<string, Error> name;
        Result<Author, SignatureVerificationError> nameAuthor;
        if (nameDecryptionResult.TryGetValue(out var nameSessionKeyAndData, out var nameDecryptionError))
        {
            nameSessionKey = nameSessionKeyAndData.SessionKey;
            var nameDataDecryptionResult = nameSessionKeyAndData.DataDecryptionResult;

            if (nameDataDecryptionResult.TryGetValue(out var nameDataAndAuthor, out nameDecryptionError))
            {
                (var nameToValidate, nameAuthor) = nameDataAndAuthor;

                name = ValidateName(nameToValidate);
            }
            else
            {
                name = nameDecryptionError;
                nameAuthor = new SignatureVerificationError(nameDecryptionError.ClaimedAuthor);
            }
        }
        else
        {
            nameSessionKey = null;
            name = nameDecryptionError;
            nameAuthor = new SignatureVerificationError(nameDecryptionError.ClaimedAuthor);
        }

        using var key = PgpPrivateKey.ImportAndUnlock(link.Key, passphrase.Span);

        var parentId = link.ParentId is not null ? new NodeUid(nodeId.VolumeId, link.ParentId.Value) : default(NodeUid?);

        if (link.Type is LinkType.Folder)
        {
            if (folder is null)
            {
                throw new ProtonApiException("Folder information missing for link of type Folder");
            }

            var folderSecrets = new FolderSecrets
            {
                HashKey = key.Decrypt(folder.HashKey),
                Key = key,
                NameSessionKey = nameSessionKey,
                PassphraseSessionKey = passphraseSessionKey,
            };

            await client.Cache.Secrets.SetFolderSecretsAsync(nodeId, folderSecrets, cancellationToken).ConfigureAwait(false);

            return new FolderNode
            {
                Id = nodeId,
                ParentId = parentId,
                Name = name,
                NameAuthor = nameAuthor,
                State = state,
                KeyAuthor = passphraseAuthor,
            };
        }

        // TODO: implement file node decryption
        throw new NotImplementedException();
    }

    private static async ValueTask<Result<SessionKeyAndData<ReadOnlyMemory<byte>>, DecryptionError>> DecryptPassphraseAsync(
        ProtonDriveClient client,
        PgpPrivateKey parentNodeKey,
        PgpArmoredMessage encryptedPassphrase,
        PgpArmoredSignature? signature,
        Author claimedAuthor,
        CancellationToken cancellationToken)
    {
        PgpSessionKey sessionKey;
        try
        {
            sessionKey = parentNodeKey.DecryptSessionKey(encryptedPassphrase);
        }
        catch (Exception e)
        {
            return DecryptionResult<ReadOnlyMemory<byte>>.KeyDecryptionFailure(e.Message, claimedAuthor);
        }

        IReadOnlyList<PgpPublicKey>? verificationKeys = null;
        string? verificationErrorMessage = null;

        if (signature is not null && claimedAuthor.EmailAddress is not null)
        {
            try
            {
                verificationKeys = await client.Account.GetAddressPublicKeysAsync(claimedAuthor.EmailAddress, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                verificationKeys = null;
                verificationErrorMessage = e.Message;
            }
        }

        try
        {
            ReadOnlyMemory<byte> passphrase;
            PgpVerificationStatus? verificationStatus;

            if (signature is not null && verificationKeys is not null)
            {
                passphrase = sessionKey.DecryptAndVerify(
                    encryptedPassphrase,
                    signature.Value,
                    new PgpKeyRing(verificationKeys),
                    out var verificationResult);

                verificationStatus = verificationResult.Status;
            }
            else
            {
                passphrase = sessionKey.Decrypt(encryptedPassphrase);
                verificationStatus = PgpVerificationStatus.Ok;
            }

            var authorIsVerified = verificationStatus is PgpVerificationStatus.Ok && verificationErrorMessage is null;

            return authorIsVerified
                ? DecryptionResult<ReadOnlyMemory<byte>>.Success(sessionKey, passphrase, claimedAuthor)
                : DecryptionResult<ReadOnlyMemory<byte>>.AuthorVerificationFailure(sessionKey, passphrase, claimedAuthor, verificationErrorMessage);
        }
        catch (Exception e)
        {
            return DecryptionResult<ReadOnlyMemory<byte>>.DataDecryptionFailure(sessionKey, e.Message, claimedAuthor);
        }
    }

    private static async ValueTask<Result<SessionKeyAndData<string>, DecryptionError>> DecryptNameAsync(
        ProtonDriveClient client,
        PgpPrivateKey parentNodeKey,
        PgpArmoredMessage encryptedName,
        Author claimedAuthor,
        CancellationToken cancellationToken)
    {
        PgpSessionKey sessionKey;
        try
        {
            sessionKey = parentNodeKey.DecryptSessionKey(encryptedName);
        }
        catch (Exception e)
        {
            return DecryptionResult<string>.KeyDecryptionFailure(e.Message, claimedAuthor);
        }

        IReadOnlyList<PgpPublicKey>? verificationKeys = null;
        string? verificationErrorMessage = null;

        if (claimedAuthor.EmailAddress is not null)
        {
            try
            {
                verificationKeys = await client.Account.GetAddressPublicKeysAsync(claimedAuthor.EmailAddress, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                verificationKeys = null;
                verificationErrorMessage = e.Message;
            }
        }

        try
        {
            PgpVerificationStatus? verificationStatus;

            string name;
            if (verificationKeys is not null)
            {
                name = sessionKey.DecryptAndVerifyText(encryptedName, new PgpKeyRing(verificationKeys), out var verificationResult);
                verificationStatus = verificationResult.Status;
            }
            else
            {
                name = sessionKey.DecryptText(encryptedName);
                verificationStatus = PgpVerificationStatus.Ok;
            }

            var authorIsVerified = verificationStatus is PgpVerificationStatus.Ok && verificationErrorMessage is null;

            return authorIsVerified
                ? DecryptionResult<string>.Success(sessionKey, name, claimedAuthor)
                : DecryptionResult<string>.AuthorVerificationFailure(sessionKey, name, claimedAuthor, verificationErrorMessage);
        }
        catch (Exception e)
        {
            return DecryptionResult<string>.DataDecryptionFailure(sessionKey, e.Message, claimedAuthor);
        }
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

    private static Result<string, Error> ValidateName(string name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return new InvalidNameError(name, "Name must not be empty");
        }

        if (name.Contains('/'))
        {
            return new InvalidNameError(name, "Name must not contain the character '/'");
        }

        return name;
    }
}
