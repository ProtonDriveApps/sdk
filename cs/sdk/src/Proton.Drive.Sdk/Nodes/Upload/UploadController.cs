namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController(Task<(NodeUid NodeUid, RevisionUid RevisionUid)> uploadTask)
{
    public Task<(NodeUid NodeUid, RevisionUid RevisionUid)> Completion { get; } = uploadTask;

    public void Pause()
    {
        // FIXME
        throw new NotImplementedException();
    }

    public void Resume()
    {
        // FIXME
        throw new NotImplementedException();
    }
}
