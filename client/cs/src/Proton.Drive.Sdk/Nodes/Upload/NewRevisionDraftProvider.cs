using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class NewRevisionDraftProvider : IRevisionDraftProvider
{
    private const int MaxNumberOfDraftCreationAttempts = 3;

    private readonly ProtonDriveClient _client;
    private readonly NodeUid _fileUid;
    private readonly RevisionId _lastKnownRevisionId;

    internal NewRevisionDraftProvider(
        ProtonDriveClient client,
        NodeUid fileUid,
        RevisionId lastKnownRevisionId)
    {
        _client = client;
        _fileUid = fileUid;
        _lastKnownRevisionId = lastKnownRevisionId;
    }

    public async ValueTask<RevisionDraft> GetDraftAsync(
        long intendedUploadSize,
        IReadOnlyList<Thumbnail> thumbnails,
        bool contentCanSeek,
        bool allowSmallUpload,
        CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(intendedUploadSize);

        var parameters = new RevisionCreationRequest
        {
            CurrentRevisionId = _lastKnownRevisionId,
            ClientId = _client.Uid,
            IntendedUploadSize = intendedUploadSize,
        };

        var operationData = await FileOperations.GetOperationDataAsync(_client, _fileUid, knownShareAndKey: null, cancellationToken)
            .ConfigureAwait(false);

        if (operationData is not { Key: { } nodeKey, ContentKey: { } contentKey })
        {
            throw new InvalidOperationException($"Cannot create draft for file {_fileUid} with missing secrets");
        }

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(_client, _fileUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await _client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

        var uploadBackendRequest = new NewRevisionUploadBackendRequest(
            intendedUploadSize,
            thumbnails,
            contentCanSeek,
            _fileUid,
            _lastKnownRevisionId,
            parameters,
            operationData,
            nodeKey,
            contentKey,
            signingKey,
            membershipAddress,
            CreateRevisionAsync,
            DeleteDraftAsync);

        var uploadBackend = await _client.RevisionUploadBackendFactory.GetBackendForAsync(
            uploadBackendRequest,
            allowSmallUpload,
            cancellationToken).ConfigureAwait(false);

        return new RevisionDraft(
            nodeKey,
            contentKey,
            signingKey,
            parentHashKey: null,
            membershipAddress,
            uploadBackend,
            intendedUploadSize,
            _client.Telemetry.GetLogger("New revision draft"));
    }

    private async ValueTask<RevisionUid> CreateRevisionAsync(RevisionCreationRequest parameters, CancellationToken cancellationToken)
    {
        var remainingNumberOfAttempts = MaxNumberOfDraftCreationAttempts;
        RevisionId? revisionId = null;

        while (revisionId is null)
        {
            try
            {
                var revisionResponse = await _client.Api.Files.CreateRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, parameters, cancellationToken)
                    .ConfigureAwait(false);

                revisionId = revisionResponse.Identity.RevisionId;
            }
            catch (ProtonApiException<RevisionErrorResponse> e)
                when (RevisionConflict.FromErrorResponse(e.Response) is { DraftRevisionId: { } draftRevisionId } conflict
                    && (conflict.DraftClientUid == _client.Uid)
                    && remainingNumberOfAttempts-- > 0)
            {
                await _client.Api.Files.DeleteRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, draftRevisionId, cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException<RevisionErrorResponse> e) when (e.Code is DriveApiResponseCodes.AlreadyExists)
            {
                throw new RevisionDraftConflictException("A new version of this file is already being uploaded", e);
            }
        }

        return new RevisionUid(_fileUid, revisionId.Value);
    }

    private async ValueTask DeleteDraftAsync(RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        await _client.Api.Files.DeleteRevisionAsync(revisionUid.NodeUid.VolumeId, revisionUid.NodeUid.LinkId, revisionUid.RevisionId, cancellationToken)
            .ConfigureAwait(false);
    }
}
