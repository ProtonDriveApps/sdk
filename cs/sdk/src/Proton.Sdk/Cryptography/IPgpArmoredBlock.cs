namespace Proton.Sdk.Cryptography;

internal interface IPgpArmoredBlock
{
    ReadOnlyMemory<byte> Bytes { get; }
}
