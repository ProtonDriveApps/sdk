using System.Buffers;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

internal sealed unsafe class InteropStream : Stream
{
    private readonly void* _callerState;
    private readonly InteropReadCallback _readCallback;
    private readonly InteropWriteCallback _writeCallback;

    public InteropStream(void* callerState, InteropReadCallback readCallback)
    {
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
    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
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
            var operation = new ReadOperation(memoryHandle);
            var operationHandle = GCHandle.Alloc(operation);

            try
            {
                _readCallback.Invoke(
                    _callerState,
                    new InteropArray<byte>((byte*)memoryHandle.Pointer, buffer.Length),
                    GCHandle.ToIntPtr(operationHandle),
                    new InteropValueCallback<int>(&OnReadDone));

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
        throw new NotSupportedException();
    }

    public override void SetLength(long value)
    {
        throw new NotSupportedException();
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        throw new NotSupportedException();
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
            var operation = new WriteOperation(memoryHandle);
            var operationHandle = GCHandle.Alloc(operation);

            try
            {
                _writeCallback.Invoke(
                    _callerState,
                    new InteropArray<byte>((byte*)memoryHandle.Pointer, buffer.Length),
                    GCHandle.ToIntPtr(operationHandle),
                    new InteropVoidCallback(&OnWriteDone));

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
    private static void OnReadDone(void* state, int numberOfBytesRead)
    {
        var operation = (ReadOperation)GCHandle.FromIntPtr(new nint(state)).Target!;

        operation.Complete(numberOfBytesRead);
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void OnWriteDone(void* state)
    {
        var operation = (WriteOperation)GCHandle.FromIntPtr(new nint(state)).Target!;

        operation.Complete();
    }

    private sealed class ReadOperation(MemoryHandle memoryHandle)
    {
        private readonly TaskCompletionSource<int> _taskCompletionSource = new();

        private MemoryHandle _memoryHandle = memoryHandle;

        public Task<int> Task => _taskCompletionSource.Task;

        public void Complete(int bytesRead)
        {
            _taskCompletionSource.SetResult(bytesRead);
            _memoryHandle.Dispose();
        }
    }

    private sealed class WriteOperation(MemoryHandle memoryHandle)
    {
        private readonly TaskCompletionSource _taskCompletionSource = new();

        private MemoryHandle _memoryHandle = memoryHandle;

        public Task Task => _taskCompletionSource.Task;

        public void Complete()
        {
            _taskCompletionSource.SetResult();
            _memoryHandle.Dispose();
        }
    }
}
