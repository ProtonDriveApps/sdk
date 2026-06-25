using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Cryptography;

public readonly struct PgpArmoredMessage(ReadOnlyMemory<byte> unarmored) : IPgpArmoredBlock<PgpArmoredMessage>
{
    public ReadOnlyMemory<byte> Unarmored { get; } = unarmored;

    public static implicit operator PgpArmoredMessage(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredMessage(ArraySegment<byte> bytes) => new(bytes);

    static PgpArmoredMessage IPgpArmoredBlock<PgpArmoredMessage>.Create(ReadOnlySpan<byte> armoredBytes)
    {
        return new PgpArmoredMessage(PgpArmorDecoder.Decode(armoredBytes));
    }

    int IPgpArmoredBlock<PgpArmoredMessage>.GetExportRequiredBufferLength()
    {
        return PgpArmorEncoder.GetMaxLengthAfterEncoding(Unarmored.Length);
    }

    int IPgpArmoredBlock<PgpArmoredMessage>.Export(Span<byte> outputBuffer)
    {
        return PgpArmorEncoder.Encode(Unarmored.Span, PgpBlockType.Message, outputBuffer);
    }
}
