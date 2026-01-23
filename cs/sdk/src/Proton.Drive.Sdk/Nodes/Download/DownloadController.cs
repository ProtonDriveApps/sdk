namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DownloadController
{
    private readonly Task _downloadTask;
    private bool _isDownloadCompleteWithVerificationIssue;

    internal DownloadController(Task downloadTask)
    {
        _downloadTask = downloadTask;
        Completion = WrapDownloadTaskAsync();
    }

    // FIXME
    public bool IsPaused { get; }

    public Task Completion { get; private set; }

    public bool GetIsDownloadCompleteWithVerificationIssue()
    {
        return _isDownloadCompleteWithVerificationIssue;
    }

#pragma warning disable S2325 // Methods and properties that don't access instance data should be static: waiting for implementation
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
#pragma warning restore S2325 // Methods and properties that don't access instance data should be static

    private async Task WrapDownloadTaskAsync()
    {
        try
        {
            await _downloadTask.ConfigureAwait(false);
        }
        catch (CompletedDownloadManifestVerificationException error)
        {
            _isDownloadCompleteWithVerificationIssue = true;
            throw new DataIntegrityException(error.Message);
        }
    }
}
