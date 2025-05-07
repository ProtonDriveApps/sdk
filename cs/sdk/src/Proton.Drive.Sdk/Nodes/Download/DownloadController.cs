namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DownloadController(Task downloadTask)
{
    public Task Completion { get; } = downloadTask;

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
