using CommunityToolkit.HighPerformance;

namespace Proton.Sdk.Cryptography;

internal readonly struct PgpArmoredPublicKey(ReadOnlyMemory<byte> bytes) : IPgpArmoredBlock
{
    public ReadOnlyMemory<byte> Bytes { get; } = bytes;

    public static implicit operator PgpArmoredPublicKey(Memory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredPublicKey(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredPublicKey(ArraySegment<byte> bytes) => new(bytes);

    public static implicit operator Stream(PgpArmoredPublicKey key) => key.Bytes.AsStream();
    public static implicit operator ReadOnlyMemory<byte>(PgpArmoredPublicKey key) => key.Bytes;
    public static implicit operator ReadOnlySpan<byte>(PgpArmoredPublicKey key) => key.Bytes.Span;
}
