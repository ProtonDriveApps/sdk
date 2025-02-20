using CommunityToolkit.HighPerformance;

namespace Proton.Sdk.Cryptography;

internal readonly struct PgpArmoredSignature(ReadOnlyMemory<byte> bytes) : IPgpArmoredBlock
{
    public ReadOnlyMemory<byte> Bytes { get; } = bytes;

    public static implicit operator PgpArmoredSignature(Memory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredSignature(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredSignature(ArraySegment<byte> bytes) => new(bytes);

    public static implicit operator Stream(PgpArmoredSignature key) => key.Bytes.AsStream();
    public static implicit operator ReadOnlyMemory<byte>(PgpArmoredSignature key) => key.Bytes;
    public static implicit operator ReadOnlySpan<byte>(PgpArmoredSignature key) => key.Bytes.Span;
}
