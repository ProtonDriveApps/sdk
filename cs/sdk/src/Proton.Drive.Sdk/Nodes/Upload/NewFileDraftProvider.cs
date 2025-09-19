namespace Proton.Drive.Sdk.Nodes.Upload;

internal sealed class NewFileDraftProvider : IFileDraftProvider
{
    private readonly NodeUid _parentFolderUid;
    private readonly string _name;
    private readonly string _mediaType;
    private readonly bool _overrideExistingDraftByOtherClient;

    internal NewFileDraftProvider(
        NodeUid parentFolderUid,
        string name,
        string mediaType,
        bool overrideExistingDraftByOtherClient)
    {
        _parentFolderUid = parentFolderUid;
        _name = name;
        _mediaType = mediaType;
        _overrideExistingDraftByOtherClient = overrideExistingDraftByOtherClient;
    }

    public async ValueTask<(RevisionUid RevisionUid, FileSecrets FileSecrets)> GetDraftAsync(
        ProtonDriveClient client,
        CancellationToken cancellationToken)
    {
        return await FileOperations.CreateDraftAsync(
            client,
            _parentFolderUid,
            _name,
            _mediaType,
            _overrideExistingDraftByOtherClient,
            cancellationToken).ConfigureAwait(false);
    }
}
