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

    public async ValueTask<RevisionDraft> GetDraftAsync(
        long intendedUploadSize,
        IEnumerable<Thumbnail> thumbnails,
        bool contentCanSeek,
        bool allowSmallUpload,
        CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(intendedUploadSize);

        var (parentKey, parentHashKey) = await FolderOperations.GetKeyAndHashKeyAsync(_client, _parentUid, cancellationToken).ConfigureAwait(false);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(_client, _parentUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await _client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var request = GetFileCreationRequest(
            intendedUploadSize,
            _client.Uid,
            _parentUid,
            _name,
            _mediaType,
            parentKey,
            parentHashKey,
            signingKey,
            membershipAddress.EmailAddress,
            out var nodeKey,
            out var fileSecrets);
        var contentKey = fileSecrets.ContentKey ?? throw new InvalidOperationException("Generated file secrets are missing content key");

        var uploadBackendRequest = new NewFileUploadBackendRequest(
            intendedUploadSize,
            thumbnails,
            contentCanSeek,
            _parentUid.VolumeId,
            request,
            fileSecrets,
            nodeKey,
            contentKey,
            signingKey,
            membershipAddress,
            CreateDraftAsync,
            DeleteDraftAsync);

        var uploadBackend = await _client.RevisionUploadBackendFactory.GetBackendForAsync(
            uploadBackendRequest,
            allowSmallUpload,
            cancellationToken).ConfigureAwait(false);

        return new RevisionDraft(
            nodeKey,
            contentKey,
            signingKey,
            parentHashKey,
            membershipAddress,
            uploadBackend,
            intendedUploadSize,
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
        out PgpPrivateKey nodeKey,
        out FileOperationData fileSecrets)
    {
        NodeOperations.GetCommonCreationParameters(
            name,
            parentKey,
            parentHashKey.Span,
            signingKey,
            PgpProfile.ProtonAead,
            out nodeKey,
            out var lockedNodeKey,
            out var nameSessionKey,
            out var passphraseSessionKey,
            out var encryptedName,
            out var nameHashDigest,
            out var encryptedKeyPassphrase,
            out var passphraseSignature);

        var contentKey = PgpSessionKey.GenerateForAead();
        var contentKeyPacket = nodeKey.EncryptSessionKey(contentKey);

        fileSecrets = new FileOperationData
        {
            ParentUid = parentUid,
            Key = nodeKey,
            PassphraseSessionKey = passphraseSessionKey,
            NameSessionKey = nameSessionKey,
            ContentKey = contentKey,
        };

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
            ContentKeyPacket = contentKeyPacket,
            ContentKeySignature = nodeKey.Sign(contentKey.Export()),
            IntendedUploadSize = intendedUploadSize,
        };
    }

    private async ValueTask<RevisionUid> CreateDraftAsync(
        FileCreationRequest request,
        FileOperationData fileSecrets,
        CancellationToken cancellationToken)
    {
        var remainingNumberOfAttempts = MaxNumberOfDraftCreationAttempts;

        RevisionUid? result = null;

        while (result is null)
        {
            try
            {
                var response = await _client.Api.Files.CreateFileAsync(_parentUid.VolumeId, request, cancellationToken).ConfigureAwait(false);

                var draftNodeUid = new NodeUid(_parentUid.VolumeId, response.Identifiers.LinkId);
                var draftRevisionUid = new RevisionUid(draftNodeUid, response.Identifiers.RevisionId);

                await _client.Cache.SetNodeOperationDataAsync(draftNodeUid, fileSecrets, cancellationToken).ConfigureAwait(false);

                result = draftRevisionUid;
            }
            catch (ProtonApiException<DetailedApiResponse> e)
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
            catch (ProtonApiException<DetailedApiResponse> e) when (e.Code is DriveApiResponseCodes.AlreadyExists)
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
