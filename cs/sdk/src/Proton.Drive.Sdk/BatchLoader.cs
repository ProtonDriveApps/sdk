using System.Buffers;

namespace Proton.Drive.Sdk;

internal sealed class BatchLoader<TId, TValue>
{
    private const int DefaultBatchSize = 50;

    private readonly ArrayBufferWriter<TId> _queueWriter;

    private readonly Func<ReadOnlyMemory<TId>, ValueTask<IEnumerable<TValue>>> _loadFunction;

    public BatchLoader(Func<ReadOnlyMemory<TId>, ValueTask<IEnumerable<TValue>>> loadFunction, int batchSize = DefaultBatchSize)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(batchSize);

        _queueWriter = new ArrayBufferWriter<TId>(batchSize);
        _loadFunction = loadFunction;
    }

    /// <summary>
    /// Queues an item for loading. If the queue size reaches the batch size, calls the load function, clears the queue, and returns the loaded items.
    /// Otherwise, returns an empty enumerable.
    /// </summary>
    public async ValueTask<IEnumerable<TValue>> QueueAndTryLoadBatchAsync(TId id)
    {
        _queueWriter.Write(new ReadOnlySpan<TId>(ref id));

        if (_queueWriter.FreeCapacity > 0)
        {
            return [];
        }

        return await LoadBatchAsync().ConfigureAwait(false);
    }

    /// <summary>
    /// Loads the remaining items in the queue if any, regardless of batch size.
    /// Otherwise, returns an empty enumerable.
    /// </summary>
    /// <remarks>
    /// Call this after no more items are expected to be queued.
    /// </remarks>
    public async ValueTask<IEnumerable<TValue>> LoadRemainingAsync()
    {
        if (_queueWriter.WrittenCount == 0)
        {
            return [];
        }

        return await LoadBatchAsync().ConfigureAwait(false);
    }

    private async ValueTask<IEnumerable<TValue>> LoadBatchAsync()
    {
        var result = await _loadFunction.Invoke(_queueWriter.WrittenMemory).ConfigureAwait(false);

        _queueWriter.Clear();

        return result;
    }
}
