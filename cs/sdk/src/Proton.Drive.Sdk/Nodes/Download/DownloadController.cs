using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DownloadController : IAsyncDisposable
{
    private readonly Task<DownloadState> _downloadStateTask;
    private readonly Func<CancellationToken, Task> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _outputStreamToDispose;
    private readonly Action<Exception, long, long>? _onFailed;
    private readonly Action<long, long>? _onSucceeded;

    private bool _isDownloadCompleteWithVerificationIssue;

    internal DownloadController(
        Task<DownloadState> downloadStateTask,
        Task downloadTask,
        Func<CancellationToken, Task> resumeFunction,
        Stream? outputStreamToDispose,
        ITaskControl taskControl,
        Action<Exception, long, long>? onFailed = null,
        Action<long, long>? onSucceeded = null)
    {
        _downloadStateTask = downloadStateTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _outputStreamToDispose = outputStreamToDispose;
        _onFailed = onFailed;
        _onSucceeded = onSucceeded;

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
                if (Completion.IsCompletedSuccessfully)
                {
                    return;
                }

                if (Completion.IsFaulted)
                {
                    var downloadState = await _downloadStateTask.ConfigureAwait(false);
                    _onFailed?.Invoke(
                        Completion.Exception.Flatten().InnerException ?? Completion.Exception,
                        downloadState.RevisionDto.Size,
                        downloadState.GetNumberOfBytesWritten());
                }

                var stateExists = _downloadStateTask.IsCompletedSuccessfully;
                if (!stateExists)
                {
                    return;
                }

                await _downloadStateTask.Result.DisposeAsync().ConfigureAwait(false);
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

    private static bool IsResumableError(Exception ex)
    {
        return ex is not DataIntegrityException
            and not ProtonApiException { TransportCode: >= 400 and < 500 }
            and not CompletedDownloadManifestVerificationException;
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

    private async ValueTask FinalizeDownloadAsync()
    {
        var onSucceededHandler = _onSucceeded;
        if (onSucceededHandler is null)
        {
            return;
        }

        if (_outputStreamToDispose is not null)
        {
            await _outputStreamToDispose.FlushAsync().ConfigureAwait(false);
        }

        var downloadState = await _downloadStateTask.ConfigureAwait(false);
        onSucceededHandler.Invoke(
            downloadState.RevisionDto.Size,
            downloadState.GetNumberOfBytesWritten());
    }
}
