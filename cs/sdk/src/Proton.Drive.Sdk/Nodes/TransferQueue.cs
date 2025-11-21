using Microsoft.Extensions.Logging;

namespace Proton.Drive.Sdk.Nodes;

internal sealed partial class TransferQueue(int maxDegreeOfParallelism, ILogger logger)
{
    private readonly ILogger _logger = logger;

    public SemaphoreSlim FileSemaphore { get; } = new(1, 1);
    public SemaphoreSlim BlockSemaphore { get; } = new(maxDegreeOfParallelism, maxDegreeOfParallelism);

    public int Depth { get; } = maxDegreeOfParallelism;

    public async ValueTask StartFileAsync(CancellationToken cancellationToken)
    {
        LogAcquiringFileSemaphore(FileSemaphore.CurrentCount);

        await FileSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        LogAcquiredFileSemaphore(FileSemaphore.CurrentCount);
    }

    public void FinishFile()
    {
        FileSemaphore.Release();

        LogReleasedFileSemaphore(FileSemaphore.CurrentCount);
    }

    public bool TryStartBlock()
    {
        LogAcquiringBlockSemaphore(BlockSemaphore.CurrentCount);

        var result = BlockSemaphore.Wait(0);

        if (result)
        {
            LogAcquiredBlockSemaphore(BlockSemaphore.CurrentCount);
        }

        return result;
    }

    public async ValueTask StartBlockAsync(CancellationToken cancellationToken)
    {
        LogAcquiringBlockSemaphore(BlockSemaphore.CurrentCount);

        await BlockSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        LogAcquiredBlockSemaphore(BlockSemaphore.CurrentCount);
    }

    public void FinishBlocks(int count)
    {
        BlockSemaphore.Release(count);

        LogReleasedBlockSemaphore(count, BlockSemaphore.CurrentCount);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to acquire file semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiringFileSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired file semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiredFileSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released file semaphore, current count is {CurrentCount}")]
    private partial void LogReleasedFileSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to acquire block semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiringBlockSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired block semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiredBlockSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Count} from block semaphore, current count is {CurrentCount}")]
    private partial void LogReleasedBlockSemaphore(int count, int currentCount);
}
