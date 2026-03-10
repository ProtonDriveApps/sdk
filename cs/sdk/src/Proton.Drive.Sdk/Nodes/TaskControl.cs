namespace Proton.Drive.Sdk.Nodes;

internal sealed class TaskControl(CancellationToken cancellationToken) : ITaskControl
{
    private readonly Lock _pauseLock = new();

    private bool _isDisposed;
    private TaskCompletionSource? _resumeSignalSource;
    private int _attemptCount;
    private CancellationTokenSource _pauseCancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

    public int Attempt => _attemptCount;
    public bool IsPaused => _resumeSignalSource is { Task.IsCompleted: false } && !IsCanceled;
    public bool IsCanceled => CancellationToken.IsCancellationRequested;

    public CancellationToken CancellationToken { get; } = cancellationToken;
    public CancellationToken PauseOrCancellationToken => _pauseCancellationTokenSource.Token;

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

            _pauseCancellationTokenSource.Cancel();
        }
    }

    public bool TryResume()
    {
        if (!IsPaused)
        {
            return false;
        }

        lock (_pauseLock)
        {
            if (!IsPaused)
            {
                return false;
            }

            _pauseCancellationTokenSource.Dispose();
            _pauseCancellationTokenSource = CancellationTokenSource.CreateLinkedTokenSource(CancellationToken);

            Interlocked.Increment(ref _attemptCount);

            var resumeSignalSource = _resumeSignalSource;
            _resumeSignalSource = null;

            resumeSignalSource?.SetResult();
        }

        return true;
    }

    public void AbortPause()
    {
        TaskCompletionSource? resumeSignalSource;

        lock (_pauseLock)
        {
            resumeSignalSource = _resumeSignalSource;
            _resumeSignalSource = null;
        }

        resumeSignalSource?.TrySetCanceled();
    }

    public void Dispose()
    {
        if (_isDisposed)
        {
            return;
        }

        _resumeSignalSource?.TrySetCanceled();

        _pauseCancellationTokenSource.Dispose();

        _isDisposed = true;
    }
}
