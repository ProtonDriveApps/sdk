using Proton.Drive.Sdk.Api.Files;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class NewRevisionDraftProvider : IFileDraftProvider
{
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
        return await RevisionOperations.CreateDraftAsync(client, _fileUid, _lastKnownRevisionId, cancellationToken).ConfigureAwait(false);
    }
}
