using CommunityToolkit.HighPerformance;

namespace Proton.Sdk.Cryptography;

internal readonly struct PgpArmoredPublicKey(ReadOnlyMemory<byte> bytes) : IPgpArmoredBlock<PgpArmoredPublicKey>
{
    public ReadOnlyMemory<byte> Bytes { get; } = bytes;

    public static implicit operator PgpArmoredPublicKey(Memory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredPublicKey(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredPublicKey(ArraySegment<byte> bytes) => new(bytes);

    public static implicit operator Stream(PgpArmoredPublicKey block) => block.Bytes.AsStream();
    public static implicit operator ReadOnlyMemory<byte>(PgpArmoredPublicKey block) => block.Bytes;
    public static implicit operator ReadOnlySpan<byte>(PgpArmoredPublicKey block) => block.Bytes.Span;
}
