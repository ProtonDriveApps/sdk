using Proton.Sdk.Threading;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DownloadController : IAsyncDisposable
{
    private readonly Task<DownloadState> _downloadStateTask;
    private readonly Func<CancellationToken, Task> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _outputStreamToDispose;
    private readonly Func<Exception, long, long, ValueTask>? _onFailedAsync;
    private readonly Func<long, long, ValueTask>? _onSucceededAsync;

    private bool _isDownloadCompleteWithVerificationIssue;

    internal DownloadController(
        Task<DownloadState> downloadStateTask,
        Task downloadTask,
        Func<CancellationToken, Task> resumeFunction,
        Stream? outputStreamToDispose,
        ITaskControl taskControl,
        Func<Exception, long, long, ValueTask>? onFailedAsync = null,
        Func<long, long, ValueTask>? onSucceededAsync = null)
    {
        _downloadStateTask = downloadStateTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _outputStreamToDispose = outputStreamToDispose;
        _onFailedAsync = onFailedAsync;
        _onSucceededAsync = onSucceededAsync;

        Completion = PauseOnResumableErrorAsync(downloadTask, taskControl.Attempt);
    }

    public bool IsPaused => _taskControl.IsPaused;

    public Task Completion { get; private set; }

    public bool GetIsDownloadCompleteWithVerificationIssue()
    {
        return _isDownloadCompleteWithVerificationIssue;
    }

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

                var downloadState = _downloadStateTask.GetResultIfCompletedSuccessfully();

                try
                {
                    if (exception is not null && _onFailedAsync is not null)
                    {
                        await _onFailedAsync.Invoke(
                            exception,
                            downloadState?.RevisionDto.Size ?? 0,
                            downloadState?.GetNumberOfBytesWritten() ?? 0).ConfigureAwait(false);
                    }
                }
                catch
                {
                    if (downloadState is not null)
                    {
                        await downloadState.DisposeAsync().ConfigureAwait(false);
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
            if (_outputStreamToDispose is not null)
            {
                await _outputStreamToDispose.DisposeAsync().ConfigureAwait(false);
            }
        }
    }

    private async Task ResumeAfterPreviousCompletionAsync(Task previousCompletion, int attempt)
    {
        await previousCompletion.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);

        await PauseOnResumableErrorAsync(
                _resumeFunction.Invoke(_taskControl.PauseOrCancellationToken),
                attempt)
            .ConfigureAwait(false);
    }

    private async Task PauseOnResumableErrorAsync(Task downloadTask, int attempt)
    {
        try
        {
            await downloadTask.ConfigureAwait(false);

            await FinalizeDownloadAsync().ConfigureAwait(false);
        }
        catch (CompletedDownloadManifestVerificationException error)
        {
            _isDownloadCompleteWithVerificationIssue = true;
            throw new DataIntegrityException(error.Message, error);
        }
        catch (Exception) when (IsResumable())
        {
            if (_taskControl.Attempt == attempt && !_taskControl.IsPaused)
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

    private async ValueTask FinalizeDownloadAsync()
    {
        var onSucceededHandler = _onSucceededAsync;
        if (onSucceededHandler is null)
        {
            return;
        }

        if (_outputStreamToDispose is not null)
        {
            await _outputStreamToDispose.FlushAsync().ConfigureAwait(false);
        }

        var downloadState = await _downloadStateTask.ConfigureAwait(false);

        await onSucceededHandler.Invoke(
            downloadState.RevisionDto.Size,
            downloadState.GetNumberOfBytesWritten()).ConfigureAwait(false);
    }

    private bool IsResumable()
    {
        return _downloadStateTask is { IsCompletedSuccessfully: true, Result.IsResumable: true };
    }
}
