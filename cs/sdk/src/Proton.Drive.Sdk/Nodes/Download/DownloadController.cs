using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes.Download;

public sealed class DownloadController : IAsyncDisposable
{
    private readonly Task<DownloadState> _downloadStateTask;
    private readonly Func<CancellationToken, Task> _resumeFunction;
    private readonly ITaskControl _taskControl;
    private readonly Stream? _outputStreamToDispose;
    private readonly Action<Exception>? _onFailed;
    private readonly Action<long, long>? _onSucceeded;

    private bool _isDownloadCompleteWithVerificationIssue;

    internal DownloadController(
        Task<DownloadState> downloadStateTask,
        Task downloadTask,
        Func<CancellationToken, Task> resumeFunction,
        Stream? outputStreamToDispose,
        ITaskControl taskControl,
        Action<Exception>? onFailed = null,
        Action<long, long>? onSucceeded = null)
    {
        _downloadStateTask = downloadStateTask;
        _resumeFunction = resumeFunction;
        _taskControl = taskControl;
        _outputStreamToDispose = outputStreamToDispose;
        _onFailed = onFailed;
        _onSucceeded = onSucceeded;

        Completion = PauseOnResumableErrorAsync(downloadTask);
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

        Completion = PauseOnResumableErrorAsync(_resumeFunction.Invoke(_taskControl.PauseOrCancellationToken));
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
                    _onFailed?.Invoke(Completion.Exception.Flatten().InnerException ?? Completion.Exception);
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

    private async Task PauseOnResumableErrorAsync(Task downloadTask)
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
