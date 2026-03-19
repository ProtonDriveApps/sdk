using Proton.Sdk;
using Proton.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Upload;

public sealed class UploadController : IAsyncDisposable
{
    private readonly Task<RevisionDraft> _revisionDraftTask;
    private readonly Func<CancellationToken, Task<UploadResult>> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _sourceStreamToDispose;
    private readonly Func<Exception, long, ValueTask>? _onFailedAsync;
    private readonly Func<long, ValueTask>? _onSucceededAsync;

    private bool _isDisposed;

    internal UploadController(
        Task<RevisionDraft> revisionDraftTask,
        Task<UploadResult> uploadTask,
        Func<CancellationToken, Task<UploadResult>> resumeFunction,
        Stream? sourceStreamToDispose,
        ITaskControl taskControl,
        Func<Exception, long, ValueTask>? onFailedAsync = null,
        Func<long, ValueTask>? onSucceededAsync = null)
    {
        _revisionDraftTask = revisionDraftTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _sourceStreamToDispose = sourceStreamToDispose;
        _onFailedAsync = onFailedAsync;
        _onSucceededAsync = onSucceededAsync;

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
        if (!_taskControl.TryResume())
        {
            return;
        }

        var previousCompletion = Completion;
        Completion = ResumeAfterPreviousCompletionAsync(previousCompletion, _taskControl.Attempt);
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
                    if (exception is not null)
                    {
                        var numberOfPlainBytesDone = draft?.NumberOfPlainBytesDone ?? 0;

                        if (_onFailedAsync is not null)
                        {
                            await _onFailedAsync.Invoke(exception, numberOfPlainBytesDone).ConfigureAwait(false);
                        }
                    }
                }
                catch
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

    private static bool IsResumableError(Exception ex)
    {
        return ex is not ProtonApiException { TransportCode: > 400 and < 500 }
            and not NodeWithSameNameExistsException
            and not IntegrityException;
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
        catch (Exception ex) when (IsResumableError(ex))
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

        var revisionDraft = await _revisionDraftTask.ConfigureAwait(false);

        await onSucceededHandler.Invoke(revisionDraft.NumberOfPlainBytesDone).ConfigureAwait(false);
    }
}
