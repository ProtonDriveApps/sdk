using CommunityToolkit.HighPerformance;
using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Cryptography;

internal readonly struct PgpArmoredSecretKey(PgpSecretKey secretKey) : IPgpArmoredBlock<PgpArmoredSecretKey>
{
    public ReadOnlyMemory<byte> Bytes { get; } = secretKey.ToBytes();

    public static implicit operator PgpArmoredSecretKey(PgpSecretKey secretKey) => new(secretKey);

    public static implicit operator Stream(PgpArmoredSecretKey block) => block.Bytes.AsStream();
    public static implicit operator ReadOnlyMemory<byte>(PgpArmoredSecretKey block) => block.Bytes;
    public static implicit operator ReadOnlySpan<byte>(PgpArmoredSecretKey block) => block.Bytes.Span;
}
