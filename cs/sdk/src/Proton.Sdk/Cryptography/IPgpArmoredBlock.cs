using CommunityToolkit.HighPerformance;

namespace Proton.Sdk.Cryptography;

internal interface IPgpArmoredBlock<in T>
    where T : IPgpArmoredBlock<T>
{
    ReadOnlyMemory<byte> Bytes { get; }

    static virtual implicit operator Stream(T block) => block.Bytes.AsStream();
    static virtual implicit operator ReadOnlyMemory<byte>(T block) => block.Bytes;
    static virtual implicit operator ReadOnlySpan<byte>(T block) => block.Bytes.Span;
}
