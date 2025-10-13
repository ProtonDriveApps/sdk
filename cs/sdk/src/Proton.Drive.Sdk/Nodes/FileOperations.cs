using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes;

internal static class FileOperations
{
    private const int MaxNumberOfDraftCreationAttempts = 3;

    public static async Task<(RevisionUid RevisionUid, FileSecrets FileSecrets)> CreateDraftAsync(
        ProtonDriveClient client,
        NodeUid parentUid,
        string name,
        string mediaType,
        bool overrideExistingDraftByOtherClient,
        CancellationToken cancellationToken)
    {
        var parentSecrets = await FolderOperations.GetSecretsAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, parentUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        NodeOperations.GetCommonCreationParameters(
            name,
            parentSecrets.Key,
            parentSecrets.HashKey.Span,
            signingKey,
            out var key,
            out var nameSessionKey,
            out var passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var passphraseSignature,
            out var lockedKeyBytes);

        var contentKey = PgpSessionKey.Generate();
        var (contentKeyToken, _) = contentKey.Export();

        var request = new FileCreationRequest
        {
            ClientUid = client.Uid,
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ParentLinkId = parentUid.LinkId,
            Passphrase = encryptedKeyPassphrase,
            PassphraseSignature = passphraseSignature,
            SignatureEmailAddress = membershipAddress.EmailAddress,
            Key = lockedKeyBytes,
            MediaType = mediaType,
            ContentKeyPacket = key.EncryptSessionKey(contentKey),
            ContentKeyPacketSignature = key.Sign(contentKeyToken),
        };

        FileCreationResponse? response = null;
        var remainingNumberOfAttempts = MaxNumberOfDraftCreationAttempts;

        while (response is null)
        {
            try
            {
                response = await client.Api.Files.CreateFileAsync(parentUid.VolumeId, request, cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
                when (e.Response is { Conflict: { LinkId: { } linkId, RevisionId: null, DraftRevisionId: not null } }
                    && (e.Response.Conflict.DraftClientUid == client.Uid || overrideExistingDraftByOtherClient))
            {
                var uidOfNodeToDelete = new NodeUid(parentUid.VolumeId, linkId);

                var deletionResults = await NodeOperations.DeleteAsync(client, [uidOfNodeToDelete], cancellationToken).ConfigureAwait(false);

                if (!deletionResults.TryGetValue(uidOfNodeToDelete, out var deletionResult))
                {
                    throw new ProtonApiException("Missing deletion result in response");
                }

                if (deletionResult.TryGetError(out var deletionException) && deletionException is not ProtonApiException { Code: ResponseCode.DoesNotExist })
                {
                    throw deletionException;
                }

                if (--remainingNumberOfAttempts <= 0)
                {
                    throw;
                }
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
            {
                throw new NodeWithSameNameExistsException(parentUid.VolumeId, e);
            }
        }

        var draftNodeUid = new NodeUid(parentUid.VolumeId, response.Identifiers.LinkId);
        var draftRevisionUid = new RevisionUid(draftNodeUid, response.Identifiers.RevisionId);

        var fileSecrets = new FileSecrets
        {
            Key = key,
            PassphraseSessionKey = passphraseSessionKey,
            NameSessionKey = nameSessionKey,
            ContentKey = contentKey,
        };

        await client.Cache.Secrets.SetFileSecretsAsync(draftNodeUid, fileSecrets, cancellationToken).ConfigureAwait(false);

        return (draftRevisionUid, fileSecrets);
    }

    public static async ValueTask<FileSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid fileUid, CancellationToken cancellationToken)
    {
        var fileSecretsResult = await client.Cache.Secrets.TryGetFileSecretsAsync(fileUid, cancellationToken).ConfigureAwait(false);

        var fileSecrets = fileSecretsResult?.GetValueOrDefault();

        if (fileSecrets is null)
        {
            var metadataResult = await NodeOperations.GetFreshNodeMetadataAsync(client, fileUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            fileSecrets = metadataResult.GetFileSecretsOrThrow();
        }

        return fileSecrets;
    }
}
