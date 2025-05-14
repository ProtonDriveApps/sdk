using CommunityToolkit.HighPerformance;

namespace Proton.Sdk.Cryptography;

internal readonly struct PgpArmoredPrivateKey(ReadOnlyMemory<byte> bytes) : IPgpArmoredBlock<PgpArmoredPrivateKey>
{
    public ReadOnlyMemory<byte> Bytes { get; } = bytes;

    public static implicit operator PgpArmoredPrivateKey(Memory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredPrivateKey(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredPrivateKey(ArraySegment<byte> bytes) => new(bytes);

    public static implicit operator Stream(PgpArmoredPrivateKey block) => block.Bytes.AsStream();
    public static implicit operator ReadOnlyMemory<byte>(PgpArmoredPrivateKey block) => block.Bytes;
    public static implicit operator ReadOnlySpan<byte>(PgpArmoredPrivateKey block) => block.Bytes.Span;
}
