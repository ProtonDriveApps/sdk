using System.Buffers;
using System.Runtime.InteropServices;
using Proton.Sdk.CExports;
using Proton.Sdk.Drive.CExports;

namespace Proton.Drive.Sdk.CExports;

internal sealed unsafe class InteropStream : Stream
{
    private readonly nint _callerState;
    private readonly delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, nint, void> _readCallback;
    private readonly delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, nint, void> _writeCallback;

    private long _position;
    private long? _length;

    public InteropStream(long length, nint callerState, nint readCallbackPointer)
    {
        _length = length;
        _callerState = callerState;
        _readCallback = (delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, nint, void>)readCallbackPointer;
        _writeCallback = default;
    }

    public InteropStream(nint callerState, nint writeCallbackPointer)
    {
        _callerState = callerState;
        _readCallback = default;
        _writeCallback = (delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, nint, void>)writeCallbackPointer;
    }

    public override bool CanRead => _readCallback != null;
    public override bool CanSeek => false;
    public override bool CanWrite => _writeCallback != null;
    public override long Length => _length ?? 0;

    public override long Position
    {
        get => _position;
        set => throw new NotSupportedException("Seeking not supported");
    }

    internal static void HandleReadResponse(nint state, StreamReadResponse response)
    {
        var operationHandle = GCHandle.FromIntPtr(state);

        try
        {
            var operation = Interop.GetFromHandle<ReadOperation>(operationHandle);

            switch (response.ResultCase)
            {
                case StreamReadResponse.ResultOneofCase.BytesRead:
                    operation.Complete(response.BytesRead);
                    break;

                case StreamReadResponse.ResultOneofCase.Error:
                    operation.Complete(response.Error.Message);
                    break;

                case StreamReadResponse.ResultOneofCase.None:
                default:
                    break;
            }
        }
        finally
        {
            operationHandle.Free();
        }
    }

    internal static void HandleWriteResponse(nint state, StreamWriteResponse response)
    {
        var operationHandle = GCHandle.FromIntPtr(new nint(state));

        try
        {
            var operation = Interop.GetFromHandle<WriteOperation>(operationHandle);

            if (response.Error != null)
            {
                operation.Complete(response.Error.Message);
                return;
            }

            operation.Complete();
        }
        finally
        {
            operationHandle.Free();
        }
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

    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (_readCallback == null)
        {
            throw new NotSupportedException("Reading not supported");
        }

        var memoryHandle = buffer.Pin();

        try
        {
            var operation = new ReadOperation(this, memoryHandle);
            var operationHandle = GCHandle.Alloc(operation);

            try
            {
                _readCallback(_callerState, new InteropArray<byte>((byte*)memoryHandle.Pointer, buffer.Length), GCHandle.ToIntPtr(operationHandle));

                return new ValueTask<int>(operation.Task);
            }
            catch
            {
                operationHandle.Free();
                throw;
            }
        }
        catch
        {
            memoryHandle.Dispose();
            throw;
        }
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

    public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (_writeCallback == null)
        {
            throw new NotSupportedException("Writing not supported");
        }

        var memoryHandle = buffer.Pin();

        try
        {
            var operation = new WriteOperation(this, memoryHandle, buffer.Length);
            var operationHandle = GCHandle.Alloc(operation);

            try
            {
                _writeCallback(_callerState, new InteropArray<byte>((byte*)memoryHandle.Pointer, buffer.Length), GCHandle.ToIntPtr(operationHandle));

                return new ValueTask(operation.Task);
            }
            catch
            {
                operationHandle.Free();
                throw;
            }
        }
        catch
        {
            memoryHandle.Dispose();
            throw;
        }
    }

    private sealed class ReadOperation(InteropStream stream, MemoryHandle memoryHandle)
    {
        private readonly InteropStream _stream = stream;
        private readonly TaskCompletionSource<int> _taskCompletionSource = new();

        private MemoryHandle _memoryHandle = memoryHandle;

        public Task<int> Task => _taskCompletionSource.Task;

        public void Complete(int bytesRead)
        {
            try
            {
                _stream._position += bytesRead;
                _taskCompletionSource.SetResult(bytesRead);
            }
            finally
            {
                _memoryHandle.Dispose();
            }
        }

        public void Complete(string errorMessage)
        {
            try
            {
                _taskCompletionSource.SetException(new IOException(errorMessage));
            }
            finally
            {
                _memoryHandle.Dispose();
            }
        }
    }

    private sealed class WriteOperation(InteropStream stream, MemoryHandle memoryHandle, int bufferLength)
    {
        private readonly InteropStream _stream = stream;
        private readonly int _bufferLength = bufferLength;
        private readonly TaskCompletionSource _taskCompletionSource = new();

        private MemoryHandle _memoryHandle = memoryHandle;

        public Task Task => _taskCompletionSource.Task;

        public void Complete()
        {
            try
            {
                _stream._position += _bufferLength;
                _stream._length = Math.Max(_stream._length ?? 0, _stream._position);
                _taskCompletionSource.SetResult();
            }
            finally
            {
                _memoryHandle.Dispose();
            }
        }

        public void Complete(string errorMessage)
        {
            try
            {
                _taskCompletionSource.SetException(new IOException(errorMessage));
            }
            finally
            {
                _memoryHandle.Dispose();
            }
        }
    }
}
