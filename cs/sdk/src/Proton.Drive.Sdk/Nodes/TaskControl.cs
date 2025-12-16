namespace Proton.Drive.Sdk.Nodes;

internal sealed class TaskControl<T>(CancellationToken cancellationToken) : ITaskControl<T>
{
    private readonly Lock _pauseLock = new();

    private TaskCompletionSource? _resumeSignalSource;
    private TaskCompletionSource<T> _pauseExceptionSignalSource = new();
    private CancellationTokenSource _pauseCancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

    public bool IsPaused => _resumeSignalSource is { Task.IsCompleted: false } && !IsCanceled;
    public bool IsCanceled => CancellationToken.IsCancellationRequested;

    public CancellationToken CancellationToken { get; } = cancellationToken;
    public CancellationToken PauseOrCancellationToken => _pauseCancellationTokenSource.Token;

    public Task<T> PauseExceptionSignal => _pauseExceptionSignalSource.Task;

    public void Pause()
    {
        if (IsPaused)
        {
            return;
        }

        lock (_pauseLock)
        {
            if (IsPaused)
            {
                return;
            }

            _resumeSignalSource = new TaskCompletionSource();

            // TODO: write unit test to verify that we reset the pause exception signal if and only if the previous one is faulted
            if (PauseExceptionSignal.IsFaulted)
            {
                _pauseExceptionSignalSource = new TaskCompletionSource<T>();
            }

            _pauseCancellationTokenSource.Cancel();
        }
    }

    public void PauseOnError(Exception ex)
    {
        // TODO: write unit test to check that we don't use the new signal source set by the Pause() call
        var pauseExceptionSignalSource = _pauseExceptionSignalSource;

        Pause();

        pauseExceptionSignalSource.TrySetException(ex);
    }

    public void Resume()
    {
        if (!IsPaused)
        {
            return;
        }

        lock (_pauseLock)
        {
            if (!IsPaused)
            {
                return;
            }

            // TODO: write unit test to justify that the fields must be set to the new state before signaling resume
            _pauseCancellationTokenSource.Dispose();
            _pauseCancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(CancellationToken);

            _pauseExceptionSignalSource = new TaskCompletionSource<T>();

            var resumeSignalSource = _resumeSignalSource;
            _resumeSignalSource = null;

            resumeSignalSource?.SetResult();
        }
    }

    public async ValueTask WaitWhilePausedAsync()
    {
        var resumeTask = _resumeSignalSource?.Task;

        if (resumeTask is not null)
        {
            await resumeTask.WaitAsync(CancellationToken).ConfigureAwait(false);
        }
    }

    public async ValueTask<T2> HandlePauseAsync<T2>(Func<CancellationToken, ValueTask<T2>> function, Func<Exception, bool>? exceptionTriggersPause = null)
    {
        await WaitWhilePausedAsync().ConfigureAwait(false);

        while (true)
        {
            try
            {
                return await function.Invoke(PauseOrCancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (IsPaused)
            {
                await WaitWhilePausedAsync().ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex) when (exceptionTriggersPause?.Invoke(ex) == true)
            {
                PauseOnError(ex);
                await WaitWhilePausedAsync().ConfigureAwait(false);
            }
        }
    }

    public void Dispose()
    {
        _pauseCancellationTokenSource.Dispose();
    }
}
