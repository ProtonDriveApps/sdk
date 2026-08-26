using Proton.Drive.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController : IAsyncDisposable
{
    private readonly Task<RevisionDraft> _revisionDraftTask;
    private readonly Func<CancellationToken, Task<UploadResult>> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _sourceStreamToDispose;
    private readonly Func<Exception, long, ValueTask>? _onFailedAsync;
    private readonly Func<UploadMetricsContext, ValueTask>? _onSucceededAsync;
    private readonly long? _contentByteCount;
    private readonly TimeProvider _timeProvider;

    private readonly Lock _stateLock = new();
    private bool _isDisposed;

    // Active and paused time are accumulated per attempt: an attempt contributes its own elapsed time to the
    // active total, and the gap between an attempt ending and the next one starting is the paused total. All
    // fields are only touched by the ctor, the arms of PauseOnResumableErrorAsync and
    // ResumeAfterPreviousCompletionAsync after its first await; those run strictly sequentially along the
    // Completion chain (attempt N's task is the completion that attempt N+1 awaits before starting), so the
    // awaits provide the memory barriers and no lock is needed.
    private long _attemptStartTimestamp;
    private long _attemptEndTimestamp;
    private bool _attemptHasEnded;
    private TimeSpan _accumulatedActiveTime;
    private TimeSpan _accumulatedPausedTime;

    internal UploadController(
        Task<RevisionDraft> revisionDraftTask,
        Task<UploadResult> uploadTask,
        Func<CancellationToken, Task<UploadResult>> resumeFunction,
        Stream? sourceStreamToDispose,
        ITaskControl taskControl,
        long startTimestamp,
        TimeProvider timeProvider,
        Func<Exception, long, ValueTask>? onFailedAsync = null,
        Func<UploadMetricsContext, ValueTask>? onSucceededAsync = null,
        long? contentByteCount = null)
    {
        _revisionDraftTask = revisionDraftTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _sourceStreamToDispose = sourceStreamToDispose;
        _onFailedAsync = onFailedAsync;
        _onSucceededAsync = onSucceededAsync;
        _contentByteCount = contentByteCount;
        _timeProvider = timeProvider;
        _attemptStartTimestamp = startTimestamp;

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

        // Stamped after the previous attempt has fully finished (including its accumulation) and immediately
        // before the new attempt starts, so the paused gap falls outside every attempt's window and is
        // accumulated as paused time instead.
        _attemptStartTimestamp = _timeProvider.GetTimestamp();
        _accumulatedPausedTime += _timeProvider.GetElapsedTime(_attemptEndTimestamp, _attemptStartTimestamp);
        _attemptHasEnded = false;

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

            EndAttempt();

            // Stamped before the success callback runs, because that is where the performance metrics are derived.
            // Each attempt contributes only its own elapsed time, so paused intervals are excluded by construction.
            // A stale attempt's elapsed time is accumulated exactly once, before the next attempt is stamped,
            // which is correct: that attempt genuinely ran until then.
            await InvokeOnSucceededAsync().ConfigureAwait(false);

            return result;
        }
        catch (Exception) when (IsResumable())
        {
            EndAttempt();

            if (_taskControl.Attempt == attempt)
            {
                _taskControl.Pause();
            }

            throw;
        }
        catch
        {
            EndAttempt();

            if (_taskControl.IsPaused)
            {
                _taskControl.AbortPause();
            }

            throw;
        }
    }

    /// <summary>
    /// Closes the current attempt's active-time window. Idempotent: the success arm runs the success callback
    /// while still inside the try, so a callback that throws would otherwise have its attempt counted twice.
    /// </summary>
    private void EndAttempt()
    {
        if (_attemptHasEnded)
        {
            return;
        }

        _attemptHasEnded = true;
        _attemptEndTimestamp = _timeProvider.GetTimestamp();
        _accumulatedActiveTime += _timeProvider.GetElapsedTime(_attemptStartTimestamp, _attemptEndTimestamp);
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

            await onSucceededHandler.Invoke(
                new UploadMetricsContext(
                    revisionDraft.NumberOfPlainBytesDone,
                    _accumulatedActiveTime,
                    _accumulatedPausedTime,
                    revisionDraft.GetUploadStatistics())).ConfigureAwait(false);
            return;
        }

        if (_contentByteCount is { } uploadedByteCount)
        {
            await onSucceededHandler.Invoke(
                new UploadMetricsContext(uploadedByteCount, _accumulatedActiveTime, _accumulatedPausedTime, Statistics: null))
                .ConfigureAwait(false);
        }
    }

    private bool IsResumable()
    {
        return _revisionDraftTask is { IsCompletedSuccessfully: true, Result.IsResumable: true };
    }
}
