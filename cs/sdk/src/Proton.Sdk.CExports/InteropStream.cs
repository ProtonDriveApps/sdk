using System.Buffers;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;

namespace Proton.Sdk.CExports;

internal sealed class InteropStream : Stream
{
    private readonly nint _bindingsHandle;
    private readonly InteropAction<nint, InteropArray<byte>, nint>? _readAction;
    private readonly InteropAction<nint, InteropArray<byte>, nint>? _writeAction;

    private long _position;
    private long? _length;

    public InteropStream(long? length, nint bindingsHandle, InteropAction<nint, InteropArray<byte>, nint>? readAction)
    {
        _length = length;
        _bindingsHandle = bindingsHandle;
        _readAction = readAction;
        _writeAction = null;
    }

    public InteropStream(nint bindingsHandle, InteropAction<nint, InteropArray<byte>, nint>? writeAction)
    {
        _bindingsHandle = bindingsHandle;
        _readAction = null;
        _writeAction = writeAction;
    }

    public override bool CanRead => _readAction != null;

    public override bool CanSeek => _length is not null;
    public override bool CanWrite => _writeAction != null;
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

    public override Task CopyToAsync(Stream destination, int bufferSize, CancellationToken cancellationToken)
    {
        return base.CopyToAsync(destination, bufferSize, cancellationToken);
    }

    public override IAsyncResult BeginRead(byte[] buffer, int offset, int count, AsyncCallback? callback, object? state)
    {
        return base.BeginRead(buffer, offset, count, callback, state);
    }

    public override int ReadByte()
    {
        return base.ReadByte();
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        return ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    }

    public override int Read(Span<byte> buffer)
    {
        return base.Read(buffer);
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        return ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (_readAction is null)
        {
            throw new NotSupportedException("Reading not supported");
        }

        using var memoryHandle = buffer.Pin();

        var response = await _readAction.Value.InvokeWithBufferAsync<Int32Value>(_bindingsHandle, buffer.Span).ConfigureAwait(false);

        if (response.Value < 0)
        {
            throw new IOException($"Invalid number of bytes read: {response.Value}");
        }

        _position += response.Value;

        return response.Value;
    }

    public override long Seek(long offset, SeekOrigin origin)
    {
        throw new NotSupportedException("Seeking not supported");
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
        if (_writeAction == null)
        {
            throw new NotSupportedException("Writing not supported");
        }

        using var memoryHandle = buffer.Pin();

        await _writeAction.Value.InvokeWithBufferAsync(_bindingsHandle, buffer.Span).ConfigureAwait(false);

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

        public override void Unpin() { }

        protected override void Dispose(bool disposing) { }
    }
}
