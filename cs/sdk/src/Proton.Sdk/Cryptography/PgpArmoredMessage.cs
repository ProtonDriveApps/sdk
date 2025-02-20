using CommunityToolkit.HighPerformance;

namespace Proton.Sdk.Cryptography;

internal readonly struct PgpArmoredMessage(ReadOnlyMemory<byte> bytes) : IPgpArmoredBlock
{
    public ReadOnlyMemory<byte> Bytes { get; } = bytes;

    public static implicit operator PgpArmoredMessage(Memory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredMessage(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredMessage(ArraySegment<byte> bytes) => new(bytes);

    public static implicit operator Stream(PgpArmoredMessage key) => key.Bytes.AsStream();
    public static implicit operator ReadOnlyMemory<byte>(PgpArmoredMessage key) => key.Bytes;
    public static implicit operator ReadOnlySpan<byte>(PgpArmoredMessage key) => key.Bytes.Span;
}
