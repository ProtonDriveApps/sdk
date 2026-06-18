using System.Security.Cryptography;
using CommunityToolkit.HighPerformance;

namespace Proton.Drive.Sdk.Cryptography;

internal sealed class HashingWriteStream(Stream underlyingStream, IncrementalHash hash, bool leaveOpen = false) : Stream
{
    private readonly Stream _underlyingStream = underlyingStream ?? throw new ArgumentNullException(nameof(underlyingStream));
    private readonly IncrementalHash _hash = hash;

    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => _underlyingStream.CanWrite;
    public override long Length => _underlyingStream.Length;
    public override long Position { get => _underlyingStream.Position; set => throw new NotSupportedException(); }

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        _underlyingStream.Write(buffer);
        _hash.AppendData(buffer);
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        _underlyingStream.Write(buffer, offset, count);
        _hash.AppendData(buffer);
    }

    public override void WriteByte(byte value)
    {
        _underlyingStream.Write(value);
        _hash.AppendData(new ReadOnlySpan<byte>(ref value));
    }

    public override async Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
#pragma warning disable CA1835 // Prefer the 'Memory'-based overloads for 'ReadAsync' and 'WriteAsync'
        await _underlyingStream.WriteAsync(buffer, offset, count, cancellationToken).ConfigureAwait(false);
#pragma warning restore CA1835 // Prefer the 'Memory'-based overloads for 'ReadAsync' and 'WriteAsync'
        _hash.AppendData(buffer);
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        await _underlyingStream.WriteAsync(buffer, cancellationToken).ConfigureAwait(false);
        _hash.AppendData(buffer.Span);
    }

    public override void Flush() => _underlyingStream.Flush();
    public override Task FlushAsync(CancellationToken cancellationToken) => _underlyingStream.FlushAsync(cancellationToken);
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

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
