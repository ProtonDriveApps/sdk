using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

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

    public async ValueTask<RevisionDraft> GetDraftAsync(CancellationToken cancellationToken)
    {
        var parameters = new RevisionCreationRequest
        {
            CurrentRevisionId = _lastKnownRevisionId,
            ClientId = _client.Uid,
        };

        var fileSecretsResult = await FileOperations.GetSecretsAsync(_client, _fileUid, cancellationToken).ConfigureAwait(false);

        if (!fileSecretsResult.TryGetValueElseError(out var fileSecrets, out _))
        {
            throw new InvalidOperationException($"Cannot create draft for file {_fileUid} with degraded secrets");
        }

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
            catch (ProtonApiException<RevisionConflictResponse> e)
                when (e.Response is { Conflict.DraftRevisionId: { } draftRevisionId }
                    && (e.Response.Conflict.DraftClientUid == _client.Uid)
                    && remainingNumberOfAttempts-- > 0)
            {
                await _client.Api.Files.DeleteRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, draftRevisionId, cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
            {
                throw new RevisionDraftConflictException(e);
            }
        }

        var draftRevisionUid = new RevisionUid(_fileUid, revisionId.Value);

        var membershipAddress = await NodeOperations.GetMembershipAddressAsync(_client, _fileUid, cancellationToken).ConfigureAwait(false);

        var signingKey = await _client.Account.GetAddressPrimaryPrivateKeyAsync(membershipAddress.Id, cancellationToken).ConfigureAwait(false);

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

    private async ValueTask DeleteDraftAsync(RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        await _client.Api.Files.DeleteRevisionAsync(revisionUid.NodeUid.VolumeId, revisionUid.NodeUid.LinkId, revisionUid.RevisionId, cancellationToken)
            .ConfigureAwait(false);
    }
}
