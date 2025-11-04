using System.Security.Cryptography;

namespace Proton.Drive.Sdk.Cryptography;

internal sealed class HashingReadStream(Stream underlyingStream, IncrementalHash hash, bool leaveOpen = false) : Stream
{
    private readonly Stream _underlyingStream = underlyingStream ?? throw new ArgumentNullException(nameof(underlyingStream));
    private readonly IncrementalHash _hash = hash;

    public override bool CanRead => _underlyingStream.CanRead;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => _underlyingStream.Length;
    public override long Position { get => _underlyingStream.Position; set => throw new NotSupportedException(); }

    public override int Read(byte[] buffer, int offset, int count)
    {
        var readCount = _underlyingStream.Read(buffer);
        _hash.AppendData(buffer.AsSpan(0, readCount));
        return readCount;
    }

    public override int Read(Span<byte> buffer)
    {
        var readCount = _underlyingStream.Read(buffer);
        _hash.AppendData(buffer[..readCount]);
        return readCount;
    }

    public override int ReadByte()
    {
        var result = (byte)_underlyingStream.ReadByte();
        _hash.AppendData(new ReadOnlySpan<byte>(ref result));
        return result;
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        var readCount = await _underlyingStream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
        _hash.AppendData(buffer.AsSpan(0, readCount));
        return readCount;
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        var readCount = await _underlyingStream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
        _hash.AppendData(buffer.Span[..readCount]);
        return readCount;
    }

    public override void Flush() => _underlyingStream.Flush();
    public override Task FlushAsync(CancellationToken cancellationToken) => _underlyingStream.FlushAsync(cancellationToken);
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

#pragma warning disable CA2215 // Dispose methods should call base class dispose
    public override ValueTask DisposeAsync()
#pragma warning restore CA2215 // Dispose methods should call base class dispose
    {
        if (leaveOpen)
        {
            return ValueTask.CompletedTask;
        }

        return _underlyingStream.DisposeAsync();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (leaveOpen || !disposing)
        {
            return;
        }

        _underlyingStream.Dispose();
    }
}
