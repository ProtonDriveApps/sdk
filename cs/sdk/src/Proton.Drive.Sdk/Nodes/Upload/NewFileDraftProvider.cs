using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class NewFileDraftProvider : IFileDraftProvider
{
    private const int MaxNumberOfDraftCreationAttempts = 3;

    private readonly NodeUid _parentUid;
    private readonly string _name;
    private readonly string _mediaType;
    private readonly bool _overrideExistingDraftByOtherClient;

    internal NewFileDraftProvider(
        NodeUid parentUid,
        string name,
        string mediaType,
        bool overrideExistingDraftByOtherClient)
    {
        _parentUid = parentUid;
        _name = name;
        _mediaType = mediaType;
        _overrideExistingDraftByOtherClient = overrideExistingDraftByOtherClient;
    }

    public async ValueTask<(RevisionUid RevisionUid, FileSecrets FileSecrets)> GetDraftAsync(ProtonDriveClient client, CancellationToken cancellationToken)
    {
        var parentSecrets = await FolderOperations.GetSecretsAsync(client, _parentUid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(client, _parentUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var (response, fileSecrets) = await CreateDraftAsync(client, parentSecrets, signingKey, membershipAddress.EmailAddress, cancellationToken)
            .ConfigureAwait(false);

        var draftNodeUid = new NodeUid(_parentUid.VolumeId, response.Identifiers.LinkId);
        var draftRevisionUid = new RevisionUid(draftNodeUid, response.Identifiers.RevisionId);

        await client.Cache.Secrets.SetFileSecretsAsync(draftNodeUid, fileSecrets, cancellationToken).ConfigureAwait(false);

        return (draftRevisionUid, fileSecrets);
    }

    public async ValueTask DeleteDraftAsync(ProtonDriveClient client, RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        await client.Api.Links.DeleteMultipleAsync(revisionUid.NodeUid.VolumeId, [revisionUid.NodeUid.LinkId], cancellationToken).ConfigureAwait(false);
    }

    private static FileCreationRequest GetFileCreationRequest(
        string clientUid,
        NodeUid parentUid,
        string name,
        string mediaType,
        FolderSecrets parentSecrets,
        PgpPrivateKey signingKey,
        string membershipEmailAddress,
        bool useAeadFeatureFlag,
        out PgpPrivateKey nodeKey,
        out PgpSessionKey passphraseSessionKey,
        out PgpSessionKey nameSessionKey,
        out PgpSessionKey contentKey)
    {
        NodeOperations.GetCommonCreationParameters(
            name,
            parentSecrets.Key,
            parentSecrets.HashKey.Span,
            signingKey,
            useAeadFeatureFlag,
            out nodeKey,
            out nameSessionKey,
            out passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var passphraseSignature,
            out var lockedKeyBytes);

        contentKey = useAeadFeatureFlag ? PgpSessionKey.GenerateForAead() : PgpSessionKey.Generate();
        var contentKeyToken = contentKey.Export();

        return new FileCreationRequest
        {
            ClientUid = clientUid,
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ParentLinkId = parentUid.LinkId,
            Passphrase = encryptedKeyPassphrase,
            PassphraseSignature = passphraseSignature,
            SignatureEmailAddress = membershipEmailAddress,
            Key = lockedKeyBytes,
            MediaType = mediaType,
            ContentKeyPacket = nodeKey.EncryptSessionKey(contentKey),
            ContentKeyPacketSignature = nodeKey.Sign(contentKeyToken),
        };
    }

    private async ValueTask<(FileCreationResponse Response, FileSecrets FileSecrets)> CreateDraftAsync(
        ProtonDriveClient client,
        FolderSecrets parentSecrets,
        PgpPrivateKey signingKey,
        string membershipEmailAddress,
        CancellationToken cancellationToken)
    {
        var remainingNumberOfAttempts = MaxNumberOfDraftCreationAttempts;

        (FileCreationResponse Response, FileSecrets FileSecrets)? result = null;

        var useAeadFeatureFlag = await client.FeatureFlagProvider.IsEnabledAsync(FeatureFlags.DriveCryptoEncryptBlocksWithPgpAead, cancellationToken).ConfigureAwait(false);

        while (result is null)
        {
            var request = GetFileCreationRequest(
                client.Uid,
                _parentUid,
                _name,
                _mediaType,
                parentSecrets,
                signingKey,
                membershipEmailAddress,
                useAeadFeatureFlag,
                out var nodeKey,
                out var passphraseSessionKey,
                out var nameSessionKey,
                out var contentKey);

            try
            {
                var response = await client.Api.Files.CreateFileAsync(_parentUid.VolumeId, request, cancellationToken).ConfigureAwait(false);

                var fileSecrets = new FileSecrets
                {
                    Key = nodeKey,
                    PassphraseSessionKey = passphraseSessionKey,
                    NameSessionKey = nameSessionKey,
                    ContentKey = contentKey,
                };

                result = (response, fileSecrets);
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
                when (e.Response is { Conflict: { LinkId: { } conflictingLinkId, RevisionId: null, DraftRevisionId: not null } }
                    && (e.Response.Conflict.DraftClientUid == client.Uid || _overrideExistingDraftByOtherClient))
            {
                var conflictingNodeUid = new NodeUid(_parentUid.VolumeId, conflictingLinkId);

                var deletionResults = await NodeOperations.DeleteAsync(client, [conflictingNodeUid], cancellationToken).ConfigureAwait(false);

                if (!deletionResults.TryGetValue(conflictingNodeUid, out var deletionResult))
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
                throw new NodeWithSameNameExistsException(_parentUid.VolumeId, e);
            }
        }

        return result.Value;
    }
}
