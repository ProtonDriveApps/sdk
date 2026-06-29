namespace Proton.Sdk.Cryptography;

public interface IPgpArmoredBlock<out T>
    where T : IPgpArmoredBlock<T>
{
    static abstract T Create(ReadOnlySpan<byte> armoredBytes);

    int GetExportRequiredBufferLength();
    int Export(Span<byte> outputBuffer);
}
