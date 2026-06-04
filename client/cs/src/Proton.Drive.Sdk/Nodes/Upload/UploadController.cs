using Proton.Drive.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController : IAsyncDisposable
{
    private readonly Task<RevisionDraft> _revisionDraftTask;
    private readonly Func<CancellationToken, Task<UploadResult>> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _sourceStreamToDispose;
    private readonly Func<Exception, long, ValueTask>? _onFailedAsync;
    private readonly Func<long, ValueTask>? _onSucceededAsync;
    private readonly long? _contentByteCount;

    private readonly Lock _stateLock = new();
    private bool _isDisposed;

    internal UploadController(
        Task<RevisionDraft> revisionDraftTask,
        Task<UploadResult> uploadTask,
        Func<CancellationToken, Task<UploadResult>> resumeFunction,
        Stream? sourceStreamToDispose,
        ITaskControl taskControl,
        Func<Exception, long, ValueTask>? onFailedAsync = null,
        Func<long, ValueTask>? onSucceededAsync = null,
        long? contentByteCount = null)
    {
        _revisionDraftTask = revisionDraftTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _sourceStreamToDispose = sourceStreamToDispose;
        _onFailedAsync = onFailedAsync;
        _onSucceededAsync = onSucceededAsync;
        _contentByteCount = contentByteCount;

        Completion = PauseOnResumableErrorAsync(uploadTask, taskControl.Attempt);
    }

    public bool IsPaused => _taskControl.IsPaused;

    public Task<UploadResult> Completion { get; private set; }

    public void Pause()
    {
        _taskControl.Pause();
    }

    public void Resume()
    {
        lock (_stateLock)
        {
            ObjectDisposedException.ThrowIf(_isDisposed, this);

            if (!_taskControl.TryResume())
            {
                return;
            }

            var previousCompletion = Completion;
            Completion = ResumeAfterPreviousCompletionAsync(previousCompletion, _taskControl.Attempt);
        }
    }

    public async ValueTask DisposeAsync()
    {
        lock (_stateLock)
        {
            if (_isDisposed)
            {
                return;
            }

            _isDisposed = true;
        }

        try
        {
            try
            {
                Exception? exception = null;
                try
                {
                    await Completion.ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    exception = ex;
                }

                var draft = _revisionDraftTask.GetResultIfCompletedSuccessfully();

                try
                {
                    if (exception is not null and not OperationCanceledException && _onFailedAsync is not null)
                    {
                        var numberOfPlainBytesDone = draft?.NumberOfPlainBytesDone ?? 0;

                        await _onFailedAsync.Invoke(exception, numberOfPlainBytesDone).ConfigureAwait(false);
                    }
                }
                finally
                {
                    if (draft is not null)
                    {
                        await draft.DisposeAsync().ConfigureAwait(false);
                    }
                }
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

    private async Task<UploadResult> ResumeAfterPreviousCompletionAsync(Task previousCompletion, int attempt)
    {
        await previousCompletion.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);

        return await PauseOnResumableErrorAsync(
                _resumeFunction.Invoke(_taskControl.PauseOrCancellationToken),
                attempt)
            .ConfigureAwait(false);
    }

    private async Task<UploadResult> PauseOnResumableErrorAsync(Task<UploadResult> uploadTask, int attempt)
    {
        try
        {
            var result = await uploadTask.ConfigureAwait(false);

            await InvokeOnSucceededAsync().ConfigureAwait(false);

            return result;
        }
        catch (Exception) when (IsResumable())
        {
            if (_taskControl.Attempt == attempt)
            {
                _taskControl.Pause();
            }

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
        var onSucceededHandler = _onSucceededAsync;
        if (onSucceededHandler is null)
        {
            return;
        }

        if (_revisionDraftTask.IsCompletedSuccessfully)
        {
            var revisionDraft = await _revisionDraftTask.ConfigureAwait(false);

            await onSucceededHandler.Invoke(revisionDraft.NumberOfPlainBytesDone).ConfigureAwait(false);
            return;
        }

        if (_contentByteCount is { } uploadedByteCount)
        {
            await onSucceededHandler.Invoke(uploadedByteCount).ConfigureAwait(false);
        }
    }

    private bool IsResumable()
    {
        return _revisionDraftTask is { IsCompletedSuccessfully: true, Result.IsResumable: true };
    }
}
