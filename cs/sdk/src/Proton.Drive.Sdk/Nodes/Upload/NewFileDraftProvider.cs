using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class NewFileDraftProvider : IRevisionDraftProvider
{
    private const int MaxNumberOfDraftCreationAttempts = 3;

    private readonly ProtonDriveClient _client;
    private readonly NodeUid _parentUid;
    private readonly string _name;
    private readonly string _mediaType;
    private readonly bool _overrideExistingDraftByOtherClient;

    internal NewFileDraftProvider(
        ProtonDriveClient client,
        NodeUid parentUid,
        string name,
        string mediaType,
        bool overrideExistingDraftByOtherClient)
    {
        _client = client;
        _parentUid = parentUid;
        _name = name;
        _mediaType = mediaType;
        _overrideExistingDraftByOtherClient = overrideExistingDraftByOtherClient;
    }

    public async ValueTask<RevisionDraft> GetDraftAsync(CancellationToken cancellationToken)
    {
        var parentSecrets = await FolderOperations.GetSecretsAsync(_client, _parentUid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(_client, _parentUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await _client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var (response, fileSecrets) = await CreateDraftAsync(parentSecrets, signingKey, membershipAddress.EmailAddress, cancellationToken)
            .ConfigureAwait(false);

        var draftNodeUid = new NodeUid(_parentUid.VolumeId, response.Identifiers.LinkId);
        var draftRevisionUid = new RevisionUid(draftNodeUid, response.Identifiers.RevisionId);

        await _client.Cache.Secrets.SetFileSecretsAsync(draftNodeUid, fileSecrets, cancellationToken).ConfigureAwait(false);

        var blockVerifier = await _client.BlockVerifierFactory.CreateAsync(draftRevisionUid, fileSecrets.Key, cancellationToken).ConfigureAwait(false);

        return new RevisionDraft(
            draftRevisionUid,
            fileSecrets.Key,
            fileSecrets.ContentKey,
            signingKey,
            membershipAddress,
            blockVerifier,
            ct => DeleteDraftAsync(draftRevisionUid, ct),
            _client.Telemetry.GetLogger("New file draft"));
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
        var pgpProfile = useAeadFeatureFlag ? PgpProfile.ProtonAead : PgpProfile.Proton;

        NodeOperations.GetCommonCreationParameters(
            name,
            parentSecrets.Key,
            parentSecrets.HashKey.Span,
            signingKey,
            pgpProfile,
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
        FolderSecrets parentSecrets,
        PgpPrivateKey signingKey,
        string membershipEmailAddress,
        CancellationToken cancellationToken)
    {
        var remainingNumberOfAttempts = MaxNumberOfDraftCreationAttempts;

        (FileCreationResponse Response, FileSecrets FileSecrets)? result = null;

        var useAeadFeatureFlag = await _client.FeatureFlagProvider.IsEnabledAsync(FeatureFlags.DriveCryptoEncryptBlocksWithPgpAead, cancellationToken)
            .ConfigureAwait(false);

        while (result is null)
        {
            var request = GetFileCreationRequest(
                _client.Uid,
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
                var response = await _client.Api.Files.CreateFileAsync(_parentUid.VolumeId, request, cancellationToken).ConfigureAwait(false);

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
                    && (e.Response.Conflict.DraftClientUid == _client.Uid || _overrideExistingDraftByOtherClient)
                    && remainingNumberOfAttempts-- > 0)
            {
                var conflictingNodeUid = new NodeUid(_parentUid.VolumeId, conflictingLinkId);

                var deletionResults = await NodeOperations.DeleteAsync(_client, [conflictingNodeUid], cancellationToken).ConfigureAwait(false);

                if (!deletionResults.TryGetValue(conflictingNodeUid, out var deletionResult))
                {
                    throw new ProtonApiException("Missing deletion result in response");
                }

                if (deletionResult.TryGetError(out var deletionException) && deletionException is not ProtonApiException { Code: ResponseCode.DoesNotExist })
                {
                    throw deletionException;
                }
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
            {
                throw new NodeWithSameNameExistsException(_parentUid.VolumeId, e);
            }
        }

        return result.Value;
    }

    private async ValueTask DeleteDraftAsync(RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        await _client.Api.Links.DeleteMultipleAsync(revisionUid.NodeUid.VolumeId, [revisionUid.NodeUid.LinkId], cancellationToken).ConfigureAwait(false);
    }
}
