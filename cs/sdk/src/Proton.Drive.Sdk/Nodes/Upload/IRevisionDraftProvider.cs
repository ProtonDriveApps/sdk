namespace Proton.Drive.Sdk.Nodes.Upload;

internal interface IRevisionDraftProvider
{
    ValueTask<RevisionDraft> GetDraftAsync(CancellationToken cancellationToken);
}
