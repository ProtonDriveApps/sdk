using Microsoft.Extensions.Logging;

namespace Proton.Drive.Sdk;

/// <summary>
/// Acts as a semaphore that acts in a first in / first out manner, can increment and decrement its count by more than 1, and can be entered as long as the count before the increment is less than the maximum.
/// </summary>
internal sealed class FifoFlexibleSemaphore
{
    private readonly ILogger _logger;
    private readonly int _maximumCount;
    private readonly Queue<(int Increment, TaskCompletionSource TaskCompletionSource)> _waitingQueue = new();

    private int _currentCount;

    public FifoFlexibleSemaphore(int maximumCount, ILogger logger)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maximumCount);

        _maximumCount = maximumCount;
        _currentCount = 0;
        _logger = logger;
    }

    public ValueTask EnterAsync(int increment, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(increment);

        _logger.LogTrace($"FifoFlexibleSemaphore.EnterAsync called with {nameof(increment)} {{Increment}}", increment);

        TaskCompletionSource tcs;
        lock (_waitingQueue)
        {
            if (_currentCount < _maximumCount)
            {
                _currentCount += increment;
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

        _logger.LogTrace($"FifoFlexibleSemaphore.Release called with {nameof(decrement)} {{Decrement}}", decrement);

        lock (_waitingQueue)
        {
            _currentCount -= decrement;

            if (_currentCount < 0)
            {
                _currentCount = 0;
            }

            while (_currentCount < _maximumCount && _waitingQueue.TryDequeue(out var queuedEntry))
            {
                var (increment, taskCompletionSource) = queuedEntry;

                if (taskCompletionSource.TrySetResult())
                {
                    _currentCount += increment;
                }
            }
        }
    }
}
