namespace Proton.Drive.Sdk;

/// <summary>
/// Acts as a semaphore that operates in a first in / first out manner, can increment and decrement its count by more than 1, and can be entered as long as the count before the increment is less than the maximum.
/// </summary>
internal sealed class FifoFlexibleSemaphore
{
    private readonly int _maximumCount;
    private readonly Queue<(int Increment, TaskCompletionSource TaskCompletionSource)> _waitingQueue = new();

    public FifoFlexibleSemaphore(int maximumCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumCount);

        _maximumCount = maximumCount;
        CurrentCount = 0;
    }

    public int CurrentCount { get; private set; }

    public ValueTask EnterAsync(int increment, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(increment);

        TaskCompletionSource tcs;
        lock (_waitingQueue)
        {
            if (CurrentCount < _maximumCount)
            {
                CurrentCount += increment;
                return ValueTask.CompletedTask;
            }

            tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            _waitingQueue.Enqueue((increment, tcs));
        }

        var cancellationTokenRegistration = cancellationToken.Register(() => tcs.TrySetCanceled());

        if (cancellationToken.IsCancellationRequested)
        {
            cancellationTokenRegistration.Dispose();
            return ValueTask.FromCanceled(cancellationToken);
        }

        return WaitAsync();

        async ValueTask WaitAsync()
        {
            await using (cancellationTokenRegistration.ConfigureAwait(false))
            {
                await tcs.Task.ConfigureAwait(false);
            }
        }
    }

    public void Release(int decrement)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(decrement);

        lock (_waitingQueue)
        {
            CurrentCount -= decrement;

            if (CurrentCount < 0)
            {
                CurrentCount = 0;
            }

            while (CurrentCount < _maximumCount && _waitingQueue.TryDequeue(out var queuedEntry))
            {
                var (increment, taskCompletionSource) = queuedEntry;

                if (taskCompletionSource.TrySetResult())
                {
                    CurrentCount += increment;
                }
            }
        }
    }
}
