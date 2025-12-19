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

    public bool GetIsDownloadCompleteWithVerificationIssue()
    {
        return _isDownloadCompleteWithVerificationIssue;
    }

    public Task Completion { get; private set; }

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
