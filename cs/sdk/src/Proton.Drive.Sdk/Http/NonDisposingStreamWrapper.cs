namespace Proton.Drive.Sdk.Http;

/// <summary>
/// Wrapper that cancels disposal of a <see cref="Stream"/> object>.
/// This wrapper forwards all operations to an inner stream but suppresses disposal of that inner stream.
/// </summary>
/// <remarks>
/// This is useful in case a stream consumer such as <see cref="StreamContent"/>
/// always disposes/closes a stream with no option to leave it open for re-use or for getting its position or length.
/// Note: The underlying stream is not disposed when this wrapper is disposed.
/// You remain responsible for explicitly disposing the original stream when it is no longer needed.
/// </remarks>
internal sealed class NonDisposingStreamWrapper(Stream innerStream) : Stream
{
    private readonly Stream _innerStream = innerStream;

    public override bool CanRead => _innerStream.CanRead;
    public override bool CanSeek => _innerStream.CanSeek;
    public override bool CanTimeout => _innerStream.CanTimeout;
    public override bool CanWrite => _innerStream.CanWrite;
    public override long Length => _innerStream.Length;
    public override long Position { get => _innerStream.Position; set => _innerStream.Position = value; }
    public override int ReadTimeout { get => _innerStream.ReadTimeout; set => _innerStream.ReadTimeout = value; }
    public override int WriteTimeout { get => _innerStream.WriteTimeout; set => _innerStream.WriteTimeout = value; }

    public override IAsyncResult BeginRead(byte[] buffer, int offset, int count, AsyncCallback? callback, object? state)
    {
        return _innerStream.BeginRead(buffer, offset, count, callback, state);
    }

    public override IAsyncResult BeginWrite(byte[] buffer, int offset, int count, AsyncCallback? callback, object? state)
    {
        return _innerStream.BeginWrite(buffer, offset, count, callback, state);
    }

    public override void CopyTo(Stream destination, int bufferSize)
    {
        _innerStream.CopyTo(destination, bufferSize);
    }

    public override Task CopyToAsync(Stream destination, int bufferSize, CancellationToken cancellationToken)
    {
        return _innerStream.CopyToAsync(destination, bufferSize, cancellationToken);
    }

    public override int EndRead(IAsyncResult asyncResult)
    {
        return _innerStream.EndRead(asyncResult);
    }

    public override void EndWrite(IAsyncResult asyncResult)
    {
        _innerStream.EndWrite(asyncResult);
    }

    public override void Flush()
    {
        _innerStream.Flush();
    }

    public override Task FlushAsync(CancellationToken cancellationToken)
    {
        return _innerStream.FlushAsync(cancellationToken);
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        return _innerStream.Read(buffer, offset, count);
    }

    public override int Read(Span<byte> buffer)
    {
        return _innerStream.Read(buffer);
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        return _innerStream.ReadAsync(buffer, offset, count, cancellationToken);
    }

    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        return _innerStream.ReadAsync(buffer, cancellationToken);
    }

    public override int ReadByte()
    {
        return _innerStream.ReadByte();
    }

    public override long Seek(long offset, SeekOrigin origin)
    {
        return _innerStream.Seek(offset, origin);
    }

    public override void SetLength(long value)
    {
        _innerStream.SetLength(value);
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        _innerStream.Write(buffer, offset, count);
    }

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        _innerStream.Write(buffer);
    }

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        return _innerStream.WriteAsync(buffer, offset, count, cancellationToken);
    }

    public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        return _innerStream.WriteAsync(buffer, cancellationToken);
    }

    public override void WriteByte(byte value)
    {
        _innerStream.WriteByte(value);
    }

    public override bool Equals(object? obj)
    {
        return _innerStream.Equals(obj);
    }

    public override int GetHashCode()
    {
        return _innerStream.GetHashCode();
    }

    public override string? ToString()
    {
        return _innerStream.ToString();
    }
}
