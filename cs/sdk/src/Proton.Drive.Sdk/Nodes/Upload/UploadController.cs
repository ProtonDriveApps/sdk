namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController(Task uploadTask)
{
    public Task Completion { get; } = uploadTask;

    public void Pause()
    {
        // TODO
        throw new NotImplementedException();
    }

    public void Resume()
    {
        // TODO
        throw new NotImplementedException();
    }
}
