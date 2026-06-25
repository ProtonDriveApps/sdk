using Proton.Cryptography.Pgp;

namespace Proton.Sdk.Cryptography;

public readonly struct PgpArmoredPublicKey(PgpPublicKey unarmored) : IPgpArmoredBlock<PgpArmoredPublicKey>
{
    public PgpPublicKey Unarmored { get; } = unarmored;

    public static implicit operator PgpArmoredPublicKey(PgpPublicKey publicKey) => new(publicKey);
    public static implicit operator PgpPublicKey(PgpArmoredPublicKey block) => block.Unarmored;

    static PgpArmoredPublicKey IPgpArmoredBlock<PgpArmoredPublicKey>.Create(ReadOnlySpan<byte> armoredBytes)
    {
        return new PgpArmoredPublicKey(PgpPublicKey.Import(armoredBytes, PgpEncoding.AsciiArmor));
    }

    int IPgpArmoredBlock<PgpArmoredPublicKey>.GetExportRequiredBufferLength() => 4096;

    int IPgpArmoredBlock<PgpArmoredPublicKey>.Export(Span<byte> outputBuffer)
    {
        return Unarmored.Export(outputBuffer, PgpEncoding.AsciiArmor);
    }
}
