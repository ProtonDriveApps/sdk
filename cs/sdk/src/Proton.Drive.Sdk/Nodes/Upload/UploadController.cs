namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController(Task uploadTask)
{
    public Task Completion { get; } = uploadTask;

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
