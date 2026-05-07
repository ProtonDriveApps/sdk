namespace Proton.Drive.Sdk.Nodes.Upload;

internal interface IRevisionDraftProvider
{
    ValueTask<RevisionDraft> GetDraftAsync(long intendedUploadSize, CancellationToken cancellationToken);
}
