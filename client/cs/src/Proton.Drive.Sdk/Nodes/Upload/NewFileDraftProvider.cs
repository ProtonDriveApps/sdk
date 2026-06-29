using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;
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

    public async ValueTask<RevisionDraft> GetDraftAsync(long intendedUploadSize, bool forPhotos, CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(intendedUploadSize);

        var (parentKey, parentHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(_client, _parentUid, forPhotos, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(_client, _parentUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await _client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var (revisionUid, key, contentKey) = await CreateDraftAsync(
            intendedUploadSize,
            parentKey,
            parentHashKey,
            signingKey,
            membershipAddress.EmailAddress,
            cancellationToken).ConfigureAwait(false);

        var blockVerifier = await _client.BlockVerifierFactory.CreateAsync(revisionUid, key, cancellationToken).ConfigureAwait(false);

        return new RevisionDraft(
            revisionUid,
            key,
            contentKey,
            signingKey,
            parentHashKey,
            membershipAddress,
            blockVerifier,
            intendedUploadSize,
            ct => DeleteDraftAsync(revisionUid, ct),
            _client.Telemetry.GetLogger("New file draft"));
    }

    private static FileCreationRequest GetFileCreationRequest(
        long intendedUploadSize,
        string clientUid,
        NodeUid parentUid,
        string name,
        string mediaType,
        PgpPrivateKey parentKey,
        ReadOnlyMemory<byte> parentHashKey,
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
            parentKey,
            parentHashKey.Span,
            signingKey,
            pgpProfile,
            out nodeKey,
            out var lockedNodeKey,
            out nameSessionKey,
            out passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var passphraseSignature);

        contentKey = useAeadFeatureFlag ? PgpSessionKey.GenerateForAead() : PgpSessionKey.Generate();

        return new FileCreationRequest
        {
            ClientUid = clientUid,
            Name = encryptedName,
            NameHashDigest = nameHashDigest,
            ParentLinkId = parentUid.LinkId,
            Passphrase = encryptedKeyPassphrase,
            PassphraseSignature = passphraseSignature,
            SignatureEmailAddress = membershipEmailAddress,
            Key = lockedNodeKey,
            MediaType = mediaType,
            ContentKeyPacket = nodeKey.EncryptSessionKey(contentKey),
            ContentKeySignature = nodeKey.Sign(contentKey.Export()),
            IntendedUploadSize = intendedUploadSize,
        };
    }

    private async ValueTask<(RevisionUid RevisionUid, PgpPrivateKey Key, PgpSessionKey ContentKey)> CreateDraftAsync(
        long intendedUploadSize,
        PgpPrivateKey parentKey,
        ReadOnlyMemory<byte> parentHashKey,
        PgpPrivateKey signingKey,
        string membershipEmailAddress,
        CancellationToken cancellationToken)
    {
        var remainingNumberOfAttempts = MaxNumberOfDraftCreationAttempts;

        (RevisionUid RevisionUid, PgpPrivateKey Key, PgpSessionKey ContentKey)? result = null;

        var useAeadFeatureFlag = await _client.FeatureFlagProvider.IsEnabledAsync(FeatureFlags.DriveCryptoEncryptBlocksWithPgpAead, cancellationToken)
            .ConfigureAwait(false);

        while (result is null)
        {
            var request = GetFileCreationRequest(
                intendedUploadSize,
                _client.Uid,
                _parentUid,
                _name,
                _mediaType,
                parentKey,
                parentHashKey,
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

                var draftNodeUid = new NodeUid(_parentUid.VolumeId, response.Identifiers.LinkId);
                var draftRevisionUid = new RevisionUid(draftNodeUid, response.Identifiers.RevisionId);

                await _client.Cache.Secrets.SetFileSecretsAsync(draftNodeUid, fileSecrets, cancellationToken).ConfigureAwait(false);

                result = (draftRevisionUid, nodeKey, contentKey);
            }
            catch (ProtonApiException<RevisionErrorResponse> e)
                when (RevisionConflict.FromErrorResponse(e.Response) is { LinkId: { } conflictingLinkId, RevisionId: null, DraftRevisionId: not null } conflict
                    && (conflict.DraftClientUid == _client.Uid || _overrideExistingDraftByOtherClient)
                    && remainingNumberOfAttempts-- > 0)
            {
                var conflictingNodeUid = new NodeUid(_parentUid.VolumeId, conflictingLinkId);

                var deletionResults = await NodeOperations.DeleteDraftAsync(_client, [conflictingNodeUid], cancellationToken).ConfigureAwait(false);

                if (!deletionResults.TryGetValue(conflictingNodeUid, out var deletionResult))
                {
                    throw new ProtonApiException("Missing deletion result in response");
                }

                if (deletionResult.TryGetError(out var deletionException)
                    && deletionException is not ProtonApiException { Code: DriveApiResponseCodes.DoesNotExist })
                {
                    throw deletionException;
                }
            }
            catch (ProtonApiException<RevisionErrorResponse> e) when (e.Code is DriveApiResponseCodes.AlreadyExists)
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
