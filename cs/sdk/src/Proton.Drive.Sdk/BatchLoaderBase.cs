using System.Buffers;

namespace Proton.Drive.Sdk;

internal abstract class BatchLoaderBase<TId, TValue>
{
    private const int DefaultBatchSize = 50;

    private readonly ArrayBufferWriter<TId> _queueWriter;

    protected BatchLoaderBase(int batchSize = DefaultBatchSize)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(batchSize);

        _queueWriter = new ArrayBufferWriter<TId>(batchSize);
    }

    /// <summary>
    /// Queues an item for loading. If the queue size reaches the batch size, calls the load function, clears the queue, and returns the loaded items.
    /// Otherwise, returns an empty enumerable.
    /// </summary>
    public async ValueTask<IEnumerable<TValue>> QueueAndTryLoadBatchAsync(TId id, CancellationToken cancellationToken)
    {
        _queueWriter.Write(new ReadOnlySpan<TId>(ref id));

        if (_queueWriter.FreeCapacity > 0)
        {
            return [];
        }

        return await LoadQueuedBatchAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Loads the remaining items in the queue if any, regardless of batch size.
    /// Otherwise, returns an empty enumerable.
    /// </summary>
    /// <remarks>
    /// Call this after no more items are expected to be queued.
    /// </remarks>
    public async ValueTask<IEnumerable<TValue>> LoadRemainingAsync(CancellationToken cancellationToken)
    {
        if (_queueWriter.WrittenCount == 0)
        {
            return [];
        }

        return await LoadQueuedBatchAsync(cancellationToken).ConfigureAwait(false);
    }

    protected abstract ValueTask<IReadOnlyList<TValue>> LoadBatchAsync(ReadOnlyMemory<TId> ids, CancellationToken cancellationToken);

    private async ValueTask<IReadOnlyList<TValue>> LoadQueuedBatchAsync(CancellationToken cancellationToken)
    {
        var result = await LoadBatchAsync(_queueWriter.WrittenMemory, cancellationToken).ConfigureAwait(false);

        _queueWriter.Clear();

        return result;
    }
}
