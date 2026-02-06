using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController : IAsyncDisposable
{
    private readonly Task<RevisionDraft> _revisionDraftTask;
    private readonly Func<CancellationToken, Task<UploadResult>> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _sourceStreamToDispose;
    private readonly Action<Exception>? _onFailed;
    private readonly Action<long>? _onSucceeded;

    private bool _isDisposed;

    internal UploadController(
        Task<RevisionDraft> revisionDraftTask,
        Task<UploadResult> uploadTask,
        Func<CancellationToken, Task<UploadResult>> resumeFunction,
        Stream? sourceStreamToDispose,
        ITaskControl taskControl,
        Action<Exception>? onFailed = null,
        Action<long>? onSucceeded = null)
    {
        _revisionDraftTask = revisionDraftTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _sourceStreamToDispose = sourceStreamToDispose;
        _onFailed = onFailed;
        _onSucceeded = onSucceeded;

        Completion = PauseOnResumableErrorAsync(uploadTask);
    }

    public bool IsPaused => _taskControl.IsPaused;

    public Task<UploadResult> Completion { get; private set; }

    public void Pause()
    {
        _taskControl.Pause();
    }

    public void Resume()
    {
        if (!_taskControl.TryResume())
        {
            return;
        }

        Completion = PauseOnResumableErrorAsync(_resumeFunction.Invoke(_taskControl.PauseOrCancellationToken));
    }

    public async ValueTask DisposeAsync()
    {
        if (_isDisposed)
        {
            return;
        }

        _isDisposed = true;

        try
        {
            try
            {
                if (Completion.IsCompletedSuccessfully)
                {
                    return;
                }

                if (Completion.IsFaulted)
                {
                    _onFailed?.Invoke(Completion.Exception.Flatten().InnerException ?? Completion.Exception);
                }

                var draftExists = _revisionDraftTask.IsCompletedSuccessfully;
                if (!draftExists)
                {
                    return;
                }

                await _revisionDraftTask.Result.DisposeAsync().ConfigureAwait(false);
            }
            finally
            {
                _taskControl.Dispose();
            }
        }
        finally
        {
            if (_sourceStreamToDispose is not null)
            {
                await _sourceStreamToDispose.DisposeAsync().ConfigureAwait(false);
            }
        }
    }

    private static bool IsResumableError(Exception ex)
    {
        return ex is not ProtonApiException { TransportCode: > 400 and < 500 }
            and not UploadContentReadingException
            and not NodeWithSameNameExistsException
            and not IntegrityException;
    }

    private async Task<UploadResult> PauseOnResumableErrorAsync(Task<UploadResult> uploadTask)
    {
        try
        {
            var result = await uploadTask.ConfigureAwait(false);

            await InvokeOnSucceededAsync().ConfigureAwait(false);

            return result;
        }
        catch (Exception ex) when (IsResumableError(ex))
        {
            _taskControl.Pause();
            throw;
        }
        catch
        {
            if (_taskControl.IsPaused)
            {
                _taskControl.AbortPause();
            }

            throw;
        }
    }

    private async ValueTask InvokeOnSucceededAsync()
    {
        var onSucceededHandler = _onSucceeded;
        if (onSucceededHandler is null)
        {
            return;
        }

        var revisionDraft = await _revisionDraftTask.ConfigureAwait(false);
        onSucceededHandler.Invoke(revisionDraft.NumberOfPlainBytesDone);
    }
}
