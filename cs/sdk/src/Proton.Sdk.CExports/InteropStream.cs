using System.Buffers;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;

namespace Proton.Sdk.CExports;

internal sealed class InteropStream : Stream
{
    private readonly nint _bindingsHandle;
    private readonly InteropFunction<nint, InteropArray<byte>, nint, nint>? _readFunction;
    private readonly InteropFunction<nint, InteropArray<byte>, nint, nint>? _writeFunction;
    private readonly InteropAction<nint, InteropArray<byte>, nint>? _seekAction;
    private readonly InteropAction<nint>? _cancelAction;

    private long _position;
    private long? _length;
    private nint _operationHandle;

    public InteropStream(
        long? length,
        nint bindingsHandle,
        InteropFunction<nint, InteropArray<byte>, nint, nint>? readFunction,
        InteropAction<nint>? cancelAction = null)
    {
        _length = length;
        _bindingsHandle = bindingsHandle;
        _readFunction = readFunction;
        _writeFunction = null;
        _cancelAction = cancelAction;
    }

    public InteropStream(
        nint bindingsHandle,
        InteropFunction<nint, InteropArray<byte>, nint, nint>? writeFunction,
        InteropAction<nint, InteropArray<byte>, nint>? seekAction = null,
        InteropAction<nint>? cancelAction = null)
    {
        _length = 0;
        _bindingsHandle = bindingsHandle;
        _readFunction = null;
        _writeFunction = writeFunction;
        _seekAction = seekAction;
        _cancelAction = cancelAction;
    }

    public override bool CanRead => _readFunction != null;

    public override bool CanSeek => _seekAction is not null;
    public override bool CanWrite => _writeFunction != null;
    public override long Length => _length ?? throw new NotSupportedException("Getting length is not supported");

    public override long Position
    {
        get => CanSeek ? _position : throw new NotSupportedException("Getting position is not supported");
        set => throw new NotSupportedException("Setting position is not supported");
    }

    public static async ValueTask<IMessage> HandleReadAsync(StreamReadRequest requestStreamRead)
    {
        var stream = Interop.GetFromHandle<Stream>(requestStreamRead.StreamHandle);

        using var bufferMemoryManager = new UnmanagedMemoryManager<byte>((nint)requestStreamRead.BufferPointer, requestStreamRead.BufferLength);

        var bytesRead = await stream.ReadAsync(bufferMemoryManager.Memory, CancellationToken.None).ConfigureAwait(false);

        return new Int32Value { Value = bytesRead };
    }

    public override void Flush()
    {
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        return ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        return ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (_readFunction is null)
        {
            throw new NotSupportedException("Reading not supported");
        }

        using var memoryHandle = buffer.Pin();

        var (readTask, operationHandle) = _readFunction.Value.InvokeWithBuffer<Int32Value>(_bindingsHandle, buffer.Span);
        _operationHandle = operationHandle;

        Int32Value readByteCount;

        await using (cancellationToken.Register(() => _cancelAction?.Invoke(_operationHandle)))
        {
            readByteCount = await readTask.AsTask().ConfigureAwait(false);
        }

        if (readByteCount.Value < 0)
        {
            throw new IOException($"Invalid number of bytes read: {readByteCount.Value}");
        }

        _position += readByteCount.Value;

        return readByteCount.Value;
    }

    public override long Seek(long offset, SeekOrigin origin)
    {
        if (_seekAction is null)
        {
            throw new NotSupportedException("Seeking not supported");
        }

        var request = new StreamSeekRequest
        {
            Offset = offset,
            Origin = (int)origin,
        };

        var requestBytes = request.ToByteArray();
        var newPosition = _seekAction.Value.InvokeWithBufferAsync<Int64Value>(_bindingsHandle, requestBytes).AsTask().ConfigureAwait(false).GetAwaiter().GetResult();

        _position = newPosition.Value;

        return _position;
    }

    public override void SetLength(long value)
    {
        throw new NotSupportedException("Setting length not supported");
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    }

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        return WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (_writeFunction == null)
        {
            throw new NotSupportedException("Writing not supported");
        }

        using var memoryHandle = buffer.Pin();

        var (writeTask, operationHandle) = _writeFunction.Value.InvokeWithBuffer(_bindingsHandle, buffer.Span);
        _operationHandle = operationHandle;

        await using (cancellationToken.Register(() => _cancelAction?.Invoke(_operationHandle)))
        {
            await writeTask.AsTask().ConfigureAwait(false);
        }

        _position += buffer.Length;
        _length = Math.Max(_length ?? 0, _position);
    }

    private sealed unsafe class UnmanagedMemoryManager<T>(nint pointer, int length) : MemoryManager<T>
        where T : unmanaged
    {
        private readonly T* _pointer = (T*)pointer;
        private readonly int _length = length;

        public override Span<T> GetSpan() => new(_pointer, _length);

        public override MemoryHandle Pin(int elementIndex = 0)
        {
            if (elementIndex < 0 || elementIndex >= _length)
            {
                throw new ArgumentOutOfRangeException(nameof(elementIndex));
            }

            return new MemoryHandle(_pointer + elementIndex);
        }

        public override void Unpin()
        {
        }

        protected override void Dispose(bool disposing)
        {
        }
    }
}
