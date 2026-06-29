using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Cryptography;

public readonly struct PgpArmoredSignature(ReadOnlyMemory<byte> unarmored) : IPgpArmoredBlock<PgpArmoredSignature>
{
    public ReadOnlyMemory<byte> Unarmored { get; } = unarmored;

    public static implicit operator PgpArmoredSignature(ReadOnlyMemory<byte> bytes) => new(bytes);
    public static implicit operator PgpArmoredSignature(ArraySegment<byte> bytes) => new(bytes);

    static PgpArmoredSignature IPgpArmoredBlock<PgpArmoredSignature>.Create(ReadOnlySpan<byte> armoredBytes)
    {
        return new PgpArmoredSignature(PgpArmorDecoder.Decode(armoredBytes));
    }

    int IPgpArmoredBlock<PgpArmoredSignature>.GetExportRequiredBufferLength() => PgpArmorEncoder.GetMaxLengthAfterEncoding(Unarmored.Length);

    int IPgpArmoredBlock<PgpArmoredSignature>.Export(Span<byte> outputBuffer)
    {
        return PgpArmorEncoder.Encode(Unarmored.Span, PgpBlockType.Signature, outputBuffer);
    }
}
