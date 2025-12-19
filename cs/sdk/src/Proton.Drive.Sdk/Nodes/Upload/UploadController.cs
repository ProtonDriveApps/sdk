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
            var draftExists = _revisionUidTask.IsCompletedSuccessfully;
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
            _taskControl.Dispose();
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Draft deletion failed for revision {RevisionUid}")]
    private partial void LogDraftDeletionFailure(Exception exception, RevisionUid revisionUid);
}
