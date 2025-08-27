using System.Buffers;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal sealed unsafe class InteropStream : Stream
{
    private readonly long? _length;
    private readonly void* _callerState;
    private readonly InteropReadCallback _readCallback;
    private readonly InteropWriteCallback _writeCallback;

    private long _position;

    public InteropStream(long length, void* callerState, InteropReadCallback readCallback)
    {
        _length = length;
        _callerState = callerState;
        _readCallback = readCallback;
        _writeCallback = default;
    }

    public InteropStream(void* callerState, InteropWriteCallback writeCallback)
    {
        _callerState = callerState;
        _readCallback = default;
        _writeCallback = writeCallback;
    }

    public override bool CanRead => _readCallback.Invoke != null;
    public override bool CanSeek => false;
    public override bool CanWrite => _writeCallback.Invoke != null;
    public override long Length => _length ?? throw new NotSupportedException("Getting length not supported");

    public override long Position
    {
        get => _position;
        set => throw new NotSupportedException("Seeking not supported");
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
        if (_readCallback.Invoke == null)
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
                _readCallback.Invoke(
                    _callerState,
                    new InteropArray<byte>((byte*)memoryHandle.Pointer, buffer.Length),
                    GCHandle.ToIntPtr(operationHandle),
                    new InteropAsyncValueCallback<int>(&OnReadSucceeded, &OnReadFailed, 0));

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
        if (_writeCallback.Invoke == null)
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
                _writeCallback.Invoke(
                    _callerState,
                    new InteropArray<byte>((byte*)memoryHandle.Pointer, buffer.Length),
                    GCHandle.ToIntPtr(operationHandle),
                    new InteropAsyncVoidCallback(&OnWriteSucceeded, &OnWriteFailed, 0));

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

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void OnReadSucceeded(void* state, int numberOfBytesRead)
    {
        var operationHandle = GCHandle.FromIntPtr(new nint(state));

        try
        {
            var operation = (ReadOperation)operationHandle.Target!;

            operation.Complete(numberOfBytesRead);
        }
        finally
        {
            operationHandle.Free();
        }
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void OnReadFailed(void* state, InteropArray<byte> errorBytes)
    {
        var operationHandle = GCHandle.FromIntPtr(new nint(state));

        try
        {
            var operation = (ReadOperation)operationHandle.Target!;

            operation.CompleteWithFailure(errorBytes);
        }
        finally
        {
            operationHandle.Free();
        }
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void OnWriteSucceeded(void* state)
    {
        var operationHandle = GCHandle.FromIntPtr(new nint(state));

        try
        {
            var operation = (WriteOperation)operationHandle.Target!;

            operation.CompleteSuccessfully();
        }
        finally
        {
            operationHandle.Free();
        }
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void OnWriteFailed(void* state, InteropArray<byte> errorBytes)
    {
        var operationHandle = GCHandle.FromIntPtr(new nint(state));

        try
        {
            var operation = (WriteOperation)operationHandle.Target!;

            operation.CompleteWithFailure(errorBytes);
        }
        finally
        {
            operationHandle.Free();
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

        public void CompleteWithFailure(InteropArray<byte> errorBytes)
        {
            try
            {
                var error = Error.Parser.ParseFrom(errorBytes.AsReadOnlySpan());
                _taskCompletionSource.SetException(new IOException(error.Message));
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

        public void CompleteSuccessfully()
        {
            try
            {
                _stream._position += _bufferLength;
                _taskCompletionSource.SetResult();
            }
            finally
            {
                _memoryHandle.Dispose();
            }
        }

        public void CompleteWithFailure(InteropArray<byte> errorBytes)
        {
            try
            {
                var error = Error.Parser.ParseFrom(errorBytes.AsReadOnlySpan());
                _taskCompletionSource.SetException(new IOException(error.Message));
            }
            finally
            {
                _memoryHandle.Dispose();
            }
        }
    }
}
