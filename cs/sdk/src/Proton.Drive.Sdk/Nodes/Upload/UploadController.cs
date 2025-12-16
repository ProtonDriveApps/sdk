namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController : IDisposable
{
    private readonly Task<UploadResult> _uploadTask;
    private readonly ITaskControl<UploadResult> _taskControl;

    internal UploadController(Task<UploadResult> uploadTask, ITaskControl<UploadResult> taskControl)
    {
        _uploadTask = uploadTask;
        _taskControl = taskControl;

        Completion = Task.WhenAny(_taskControl.PauseExceptionSignal, _uploadTask).Unwrap();
    }

    public bool IsPaused => _taskControl.IsPaused;

    // FIXME: Add unit test to ensure that the revision UID is of the new active revision
    public Task<UploadResult> Completion { get; private set; }

    public void Pause()
    {
        _taskControl.Pause();

        Completion = Task.WhenAny(_taskControl.PauseExceptionSignal, _uploadTask).Unwrap();
    }

    public void Resume()
    {
        _taskControl.Resume();

        if (Completion.IsFaulted)
        {
            Completion = Task.WhenAny(_taskControl.PauseExceptionSignal, _uploadTask).Unwrap();
        }
    }

    public void Dispose()
    {
        _taskControl.Dispose();
    }
}
