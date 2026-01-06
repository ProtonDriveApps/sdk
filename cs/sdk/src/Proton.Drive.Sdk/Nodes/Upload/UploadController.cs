using Microsoft.Extensions.Logging;
using Proton.Drive.Sdk.Api;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed partial class UploadController : IAsyncDisposable
{
    private readonly IDriveApiClients _apiClients;
    private readonly IFileDraftProvider _fileDraftProvider;
    private readonly Task<RevisionUid> _revisionUidTask;
    private readonly Task<UploadResult> _uploadTask;
    private readonly ITaskControl<UploadResult> _taskControl;
    private readonly ILogger _logger;

    internal UploadController(
        IDriveApiClients apiClients,
        IFileDraftProvider fileDraftProvider,
        Task<RevisionUid> revisionUidTask,
        Task<UploadResult> uploadTask,
        ITaskControl<UploadResult> taskControl,
        ILogger logger)
    {
        _apiClients = apiClients;
        _fileDraftProvider = fileDraftProvider;
        _revisionUidTask = revisionUidTask;
        _uploadTask = uploadTask;
        _taskControl = taskControl;
        _logger = logger;

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

    public async ValueTask DisposeAsync()
    {
        try
        {
            var draftExists = _revisionUidTask.IsCompletedSuccessfully && !_uploadTask.IsCompletedSuccessfully;
            if (!draftExists)
            {
                return;
            }

            var revisionUid = _revisionUidTask.Result;

            try
            {
                await _fileDraftProvider.DeleteDraftAsync(_apiClients, revisionUid, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                LogDraftDeletionFailure(ex, revisionUid);
            }
        }
        finally
        {
            var uploadTaskIsCompleted = _uploadTask.IsCompleted;

            _taskControl.Dispose();

            // If the upload task is not yet completed, disposal of task control unblocks it from being paused.
            // The unblocked upload task will complete unsuccessfully (either in faulted or cancelled state).
            if (!uploadTaskIsCompleted)
            {
                try
                {
                    await _uploadTask.ConfigureAwait(false);
                }
                catch
                {
                    // Upon upload controller disposal, the upload task is not expected to be observed,
                    // so we catch here to prevent escalation of unhandled exception.
                }
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Draft deletion failed for revision {RevisionUid}")]
    private partial void LogDraftDeletionFailure(Exception exception, RevisionUid revisionUid);
}
