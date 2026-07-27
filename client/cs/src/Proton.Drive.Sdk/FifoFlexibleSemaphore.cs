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

    public bool TryEnter(int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);

        lock (_waitingQueue)
        {
            if (CurrentCount <= 0)
            {
                return false;
            }

            CurrentCount -= count;
            return true;
        }
    }

    public ValueTask EnterAsync(int count, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);

        if (cancellationToken.IsCancellationRequested)
        {
            return ValueTask.FromCanceled(cancellationToken);
        }

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

        var cancellationTokenRegistration = cancellationToken.Register(tcsAsState => ((TaskCompletionSource)tcsAsState!).TrySetCanceled(), tcs);

        return WaitForEntryAsync(tcs.Task, cancellationTokenRegistration);
    }

    public void DecreaseCount(int count)
    {
        lock (_waitingQueue)
        {
            CurrentCount -= count;
        }
    }

    public void Release(int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);

        lock (_waitingQueue)
        {
            if (CurrentCount + count > MaximumCount)
            {
                throw new InvalidOperationException("Releasing would increase the count beyond the maximum.");
            }

            CurrentCount += count;

            while (CurrentCount > 0 && _waitingQueue.TryDequeue(out var queuedEntry))
            {
                var (countToSubtract, taskCompletionSource) = queuedEntry;

                if (!taskCompletionSource.TrySetResult())
                {
                    // If the task result cannot be set, then the queuing entry must have been canceled, so ignore it.
                    continue;
                }

                CurrentCount -= countToSubtract;
            }
        }
    }

    private static async ValueTask WaitForEntryAsync(Task entryTask, CancellationTokenRegistration cancellationTokenRegistration)
    {
        await using (cancellationTokenRegistration.ConfigureAwait(false))
        {
            await entryTask.ConfigureAwait(false);
        }
    }
}
