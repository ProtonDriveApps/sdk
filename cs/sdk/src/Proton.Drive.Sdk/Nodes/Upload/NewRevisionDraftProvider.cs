using Proton.Drive.Sdk.Api;
using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class NewRevisionDraftProvider : IFileDraftProvider
{
    private const int MaxNumberOfDraftCreationAttempts = 3;

    private readonly NodeUid _fileUid;
    private readonly RevisionId _lastKnownRevisionId;

    internal NewRevisionDraftProvider(
        NodeUid fileUid,
        RevisionId lastKnownRevisionId)
    {
        _fileUid = fileUid;
        _lastKnownRevisionId = lastKnownRevisionId;
    }

    public async ValueTask<(RevisionUid RevisionUid, FileSecrets FileSecrets)> GetDraftAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        var parameters = new RevisionCreationRequest
        {
            CurrentRevisionId = _lastKnownRevisionId,
            ClientId = client.Uid,
        };

        var fileSecretsResult = await FileOperations.GetSecretsAsync(client, _fileUid, cancellationToken).ConfigureAwait(false);

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
                var revisionResponse = await client.Api.Files.CreateRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, parameters, cancellationToken)
                    .ConfigureAwait(false);

                revisionId = revisionResponse.Identity.RevisionId;
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
                when (e.Response is { Conflict.DraftRevisionId: { } draftRevisionId }
                    && (e.Response.Conflict.DraftClientUid == client.Uid)
                    && remainingNumberOfAttempts-- > 0)
            {
                await client.Api.Files.DeleteRevisionAsync(_fileUid.VolumeId, _fileUid.LinkId, draftRevisionId, cancellationToken).ConfigureAwait(false);
            }
            catch (ProtonApiException<RevisionConflictResponse> e)
            {
                throw new RevisionDraftConflictException(e);
            }
        }

        return (new RevisionUid(_fileUid, revisionId.Value), fileSecrets);
    }

    public async ValueTask DeleteDraftAsync(IDriveApiClients apiClients, RevisionUid revisionUid, CancellationToken cancellationToken)
    {
        await apiClients.Files.DeleteRevisionAsync(revisionUid.NodeUid.VolumeId, revisionUid.NodeUid.LinkId, revisionUid.RevisionId, cancellationToken)
            .ConfigureAwait(false);
    }
}
