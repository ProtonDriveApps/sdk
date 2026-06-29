using System.Buffers;
using System.Runtime.CompilerServices;

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
    public async IAsyncEnumerable<TValue> QueueAndTryLoadBatchAsync(TId id, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        _queueWriter.Write(new ReadOnlySpan<TId>(ref id));

        if (_queueWriter.FreeCapacity > 0)
        {
            yield break;
        }

        await foreach (var value in EnumerateQueuedBatchAsync(cancellationToken).ConfigureAwait(false))
        {
            yield return value;
        }
    }

    /// <summary>
    /// Loads the remaining items in the queue if any, regardless of batch size.
    /// Otherwise, returns an empty enumerable.
    /// </summary>
    /// <remarks>
    /// Call this after no more items are expected to be queued.
    /// </remarks>
    public async IAsyncEnumerable<TValue> LoadRemainingAsync([EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (_queueWriter.WrittenCount == 0)
        {
            yield break;
        }

        await foreach (var value in EnumerateQueuedBatchAsync(cancellationToken).ConfigureAwait(false))
        {
            yield return value;
        }
    }

    protected abstract IAsyncEnumerable<TValue> LoadBatchAsync(ReadOnlyMemory<TId> ids, CancellationToken cancellationToken);

    private async IAsyncEnumerable<TValue> EnumerateQueuedBatchAsync([EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await foreach (var value in LoadBatchAsync(_queueWriter.WrittenMemory, cancellationToken).ConfigureAwait(false))
        {
            yield return value;
        }

        _queueWriter.Clear();
    }
}
