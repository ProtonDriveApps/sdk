using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal static class FileOperations
{
    public static async Task<(RevisionUid RevisionUid, FileSecrets FileSecrets)> CreateOrGetExistingDraftAsync(
        ProtonDriveClient client,
        NodeUid parentUid,
        string name,
        string mediaType,
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

        var clientUid = await client.GetClientUidAsync(cancellationToken).ConfigureAwait(false);

        var parameters = new FileCreationParameters
        {
            ClientUid = clientUid,
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

        FileSecrets fileSecrets;
        RevisionUid draftRevisionUid;
        try
        {
            var response = await client.Api.Files.CreateFileAsync(parentUid.VolumeId, parameters, cancellationToken).ConfigureAwait(false);

            var draftNodeUid = new NodeUid(parentUid.VolumeId, response.Identifiers.LinkId);
            draftRevisionUid = new RevisionUid(draftNodeUid, response.Identifiers.RevisionId);

            fileSecrets = new FileSecrets
            {
                Key = key,
                PassphraseSessionKey = passphraseSessionKey,
                NameSessionKey = nameSessionKey,
                ContentKey = contentKey,
            };

            await client.Cache.Secrets.SetFileSecretsAsync(draftNodeUid, fileSecrets, cancellationToken).ConfigureAwait(false);
        }
        catch (ProtonApiException<RevisionConflictResponse> ex)
            when (ex.Response is { Conflict: { LinkId: not null, DraftClientUid: not null, DraftRevisionId: not null } })
        {
            if (ex.Response.Conflict.DraftClientUid != clientUid)
            {
                throw;
            }

            var draftNodeUid = new NodeUid(parentUid.VolumeId, ex.Response.Conflict.LinkId.Value);
            draftRevisionUid = new RevisionUid(draftNodeUid, ex.Response.Conflict.DraftRevisionId.Value);

            fileSecrets = await GetSecretsAsync(client, draftNodeUid, cancellationToken).ConfigureAwait(false);
        }

        return (draftRevisionUid, fileSecrets);
    }

    public static async ValueTask<FileSecrets> GetSecretsAsync(ProtonDriveClient client, NodeUid fileUid, CancellationToken cancellationToken)
    {
        var fileSecrets = await client.Cache.Secrets.TryGetFileSecretsAsync(fileUid, cancellationToken).ConfigureAwait(false);

        if (fileSecrets is null)
        {
            var nodeProvisionResult = await NodeOperations.GetFreshNodeAndSecretsAsync(client, fileUid, knownShareAndKey: null, cancellationToken)
                .ConfigureAwait(false);

            fileSecrets = nodeProvisionResult.GetFileSecretsOrThrow();
        }

        return fileSecrets;
    }
}
