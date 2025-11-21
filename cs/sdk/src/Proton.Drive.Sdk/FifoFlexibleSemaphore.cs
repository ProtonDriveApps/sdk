namespace Proton.Drive.Sdk;

/// <summary>
/// Acts as a semaphore that operates in a first in / first out manner, can increment and decrement its count by more than 1, and can be entered as long as the count before the increment is less than the maximum.
/// </summary>
internal sealed class FifoFlexibleSemaphore
{
    private readonly Queue<(int Increment, TaskCompletionSource TaskCompletionSource)> _waitingQueue = new();

    public FifoFlexibleSemaphore(int maximumCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumCount);

        MaximumCount = maximumCount;
        CurrentCount = maximumCount;
    }

    public int MaximumCount { get; }
    public int CurrentCount { get; private set; }

    public ValueTask EnterAsync(int count, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);

        TaskCompletionSource tcs;
        lock (_waitingQueue)
        {
            if (CurrentCount > 0)
            {
                CurrentCount -= count;
                return ValueTask.CompletedTask;
            }

            tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            _waitingQueue.Enqueue((count, tcs));
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

    public void Release(int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);

        lock (_waitingQueue)
        {
            CurrentCount += count;

            if (CurrentCount > MaximumCount)
            {
                CurrentCount = MaximumCount;
            }

            while (CurrentCount > 0 && _waitingQueue.TryDequeue(out var queuedEntry))
            {
                var (countToDecrement, taskCompletionSource) = queuedEntry;

                if (taskCompletionSource.TrySetResult())
                {
                    CurrentCount -= countToDecrement;
                }
            }
        }
    }
}
