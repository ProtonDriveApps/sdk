namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController(Task<(NodeUid NodeUid, RevisionUid RevisionUid)> uploadTask)
{
    // FIXME: Add unit test to ensure that the revision UID is of the new active revision
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
