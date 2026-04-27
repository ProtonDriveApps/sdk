using Microsoft.Extensions.Logging;

namespace Proton.Drive.Sdk.Nodes;

/// <summary>
/// Manages the queueing of the transfer of files and their blocks.
/// </summary>
/// <remarks>
/// <para>
/// To use this queue, acquire a slot for a file with an initial number of blocks (the actual number of block may not be known initially)
/// using <see cref="EnqueueFileAsync"/> or <see cref="TryEnqueueFile"/>. Acquisition of that file slot happens once there are enough free block upload slots
/// to accommodate at least one block of that file. Once the file slot is acquired, a queue token is returned.
/// </para>
/// <para>
/// Next, the transfer has to start queuing blocks, but only one file can be queuing blocks at a time,
/// so a call to <see cref="StartBlockQueueingAsync"/> is required. Once all the blocks have been queued, or if the queuing needs to be stopped for any reason,
/// a call to <see cref="FinishBlockQueueing"/> is required to allow other files to start queuing their blocks.
/// When new blocks are discovered for a file during queuing, they can be added to the file's block count using <see cref="IncreaseFileRemainingBlockCount"/>.
/// When blocks have been transferred, they can be removed from the file's block count using <see cref="DecreaseFileRemainingBlockCount"/>.
/// </para>
/// <para>
/// When a block is ready to be transferred, a slot for block transfer needs to be acquired
/// using <see cref="EnqueueBlockAsync"/> or <see cref="TryEnqueueBlock"/>. Block transfer slots are acquired individually, and there can be multiple blocks
/// being transferred at the same time up to the maximum degree of parallelism specified for the queue.
/// Once a block transfer is completed, the slot for block transfer needs to be released using <see cref="DequeueBlocks"/>
/// to allow other blocks to be transferred.
/// </para>
/// </remarks>
/// <param name="maxDegreeOfParallelism">The maximum number of blocks that can be transferred simultaneously</param>
/// <param name="logger">A logger</param>
internal sealed partial class TransferQueue(int maxDegreeOfParallelism, ILogger logger)
{
    private readonly ILogger _logger = logger;
    private readonly Dictionary<long, int> _fileBlocks = [];
    private readonly Lock _fileBlocksLock = new();

    private long _lastEntryId;

    public FifoFlexibleSemaphore FileQueueSemaphore { get; } = new(maxDegreeOfParallelism);
    public SemaphoreSlim BlockQueueingSemaphore { get; } = new(1, 1);
    public SemaphoreSlim BlockTransferSemaphore { get; } = new(maxDegreeOfParallelism, maxDegreeOfParallelism);

    public int Depth { get; } = maxDegreeOfParallelism;

    public long? TryEnqueueFile(int initialBlockCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(initialBlockCount);

        LogTryingToAcquireFileQueueSemaphore(FileQueueSemaphore.CurrentCount);

        if (!FileQueueSemaphore.TryEnter(initialBlockCount))
        {
            LogFailedToAcquireFileQueueSemaphore(FileQueueSemaphore.CurrentCount);
            return null;
        }

        LogAcquiredFileQueueSemaphore(FileQueueSemaphore.CurrentCount);

        var queuePosition = Interlocked.Increment(ref _lastEntryId);

        lock (_fileBlocksLock)
        {
            _fileBlocks.Add(queuePosition, initialBlockCount);
        }

        return queuePosition;
    }

    public async ValueTask<long> EnqueueFileAsync(int initialBlockCount, CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(initialBlockCount);

        LogAcquiringFileQueueSemaphore(FileQueueSemaphore.CurrentCount);

        await FileQueueSemaphore.EnterAsync(initialBlockCount, cancellationToken).ConfigureAwait(false);

        LogAcquiredFileQueueSemaphore(FileQueueSemaphore.CurrentCount);

        var queuePosition = Interlocked.Increment(ref _lastEntryId);

        lock (_fileBlocksLock)
        {
            _fileBlocks.Add(queuePosition, initialBlockCount);
        }

        return queuePosition;
    }

    public void IncreaseFileRemainingBlockCount(long queueToken, int additionalBlockCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(additionalBlockCount);

        FileQueueSemaphore.DecreaseCount(additionalBlockCount);

        LogDecreasedFileQueueSemaphoreCount(additionalBlockCount, FileQueueSemaphore.CurrentCount);

        lock (_fileBlocksLock)
        {
            var currentBlockCount = _fileBlocks.GetValueOrDefault(queueToken);

            _fileBlocks[queueToken] = currentBlockCount + additionalBlockCount;
        }
    }

    public void DecreaseFileRemainingBlockCount(long queueToken, int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(count);

        lock (_fileBlocksLock)
        {
            if (!_fileBlocks.TryGetValue(queueToken, out var currentBlockCount))
            {
                throw new InvalidOperationException($"Queue token {queueToken} not found in transfer queue.");
            }

            _fileBlocks[queueToken] = currentBlockCount - count;

            RemoveBlocksFromFileQueue(count);
        }
    }

    public void RemoveFileFromQueue(long queueToken)
    {
        lock (_fileBlocksLock)
        {
            if (!_fileBlocks.Remove(queueToken, out var blockCount))
            {
                throw new InvalidOperationException($"Queue token {queueToken} not found in transfer queue.");
            }

            RemoveBlocksFromFileQueue(blockCount);
        }
    }

    public async ValueTask StartBlockQueueingAsync(CancellationToken cancellationToken)
    {
        LogAcquiringBlockQueueingSemaphore(BlockQueueingSemaphore.CurrentCount);

        await BlockQueueingSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        LogAcquiredBlockQueueingSemaphore(BlockQueueingSemaphore.CurrentCount);
    }

    public void FinishBlockQueueing()
    {
        BlockQueueingSemaphore.Release();

        LogReleasedBlockQueueingSemaphore(BlockQueueingSemaphore.CurrentCount);
    }

    public bool TryEnqueueBlock()
    {
        LogAcquiringBlockTransferSemaphore(BlockTransferSemaphore.CurrentCount);

        var result = BlockTransferSemaphore.Wait(0);

        if (result)
        {
            LogAcquiredBlockTransferSemaphore(BlockTransferSemaphore.CurrentCount);
        }

        return result;
    }

    public async ValueTask EnqueueBlockAsync(CancellationToken cancellationToken)
    {
        LogAcquiringBlockTransferSemaphore(BlockTransferSemaphore.CurrentCount);

        await BlockTransferSemaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

        LogAcquiredBlockTransferSemaphore(BlockTransferSemaphore.CurrentCount);
    }

    /// <summary>
    /// Removes blocks from the block transfer queue, making room for new blocks to be queued.
    /// </summary>
    public void DequeueBlocks(int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(count);

        BlockTransferSemaphore.Release(count);

        LogReleasedBlockTransferSemaphore(count, BlockTransferSemaphore.CurrentCount);
    }

    private void RemoveBlocksFromFileQueue(int blockCount)
    {
        FileQueueSemaphore.Release(blockCount);

        LogReleasedFileQueueSemaphore(blockCount, FileQueueSemaphore.CurrentCount);
    }

    [LoggerMessage(Level = LogLevel.Trace, Message = "Waiting to acquire file queue semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiringFileQueueSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Trying to acquire file queue semaphore, current count is {CurrentCount}")]
    private partial void LogTryingToAcquireFileQueueSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired file queue semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiredFileQueueSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Failed to acquire file queue semaphore, current count is {CurrentCount}")]
    private partial void LogFailedToAcquireFileQueueSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Increased file queue count by {Count}, current count is {CurrentCount}")]
    private partial void LogDecreasedFileQueueSemaphoreCount(int count, int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Count} from file queue semaphore, current count is {CurrentCount}")]
    private partial void LogReleasedFileQueueSemaphore(int count, int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Waiting to acquire block queueing semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiringBlockQueueingSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired block queueing semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiredBlockQueueingSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released block queueing semaphore, current count is {CurrentCount}")]
    private partial void LogReleasedBlockQueueingSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Waiting to acquire block transfer semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiringBlockTransferSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Acquired block transfer semaphore, current count is {CurrentCount}")]
    private partial void LogAcquiredBlockTransferSemaphore(int currentCount);

    [LoggerMessage(Level = LogLevel.Trace, Message = "Released {Count} from block transfer semaphore, current count is {CurrentCount}")]
    private partial void LogReleasedBlockTransferSemaphore(int count, int currentCount);
}
