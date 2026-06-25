using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Cryptography;

public readonly struct PgpArmoredSecretKey(PgpSecretKey unarmored) : IPgpArmoredBlock<PgpArmoredSecretKey>
{
    public PgpSecretKey Unarmored { get; } = unarmored;

    public static implicit operator PgpArmoredSecretKey(PgpSecretKey secretKey) => new(secretKey);
    public static implicit operator PgpSecretKey(PgpArmoredSecretKey block) => block.Unarmored;

    static PgpArmoredSecretKey IPgpArmoredBlock<PgpArmoredSecretKey>.Create(ReadOnlySpan<byte> armoredBytes)
    {
        return new PgpArmoredSecretKey(PgpSecretKey.Import(armoredBytes, PgpEncoding.AsciiArmor));
    }

    int IPgpArmoredBlock<PgpArmoredSecretKey>.GetExportRequiredBufferLength() => 4096;

    int IPgpArmoredBlock<PgpArmoredSecretKey>.Export(Span<byte> outputBuffer)
    {
        return Unarmored.Export(outputBuffer, PgpEncoding.AsciiArmor);
    }
}
