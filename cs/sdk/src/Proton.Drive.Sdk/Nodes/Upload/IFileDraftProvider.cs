namespace Proton.Drive.Sdk.Nodes.Upload;

internal interface IFileDraftProvider
{
    ValueTask<(RevisionUid RevisionUid, FileSecrets FileSecrets)> GetDraftAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken);
}
