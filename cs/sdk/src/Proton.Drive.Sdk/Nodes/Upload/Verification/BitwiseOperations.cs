using System.Numerics;
using System.Runtime.InteropServices;

namespace Proton.Drive.Sdk.Nodes.Upload.Verification;

internal static class BitwiseOperations
{
    public static byte[] Xor(ReadOnlySpan<byte> a, ReadOnlySpan<byte> b)
    {
        if (b.Length != a.Length)
        {
            throw new ArgumentException("Memory segments must have the same length", nameof(b));
        }

        var result = new byte[a.Length];

        var vectorChunks = b.Length / Vector<byte>.Count;
        var vectorChunksBound = vectorChunks * Vector<byte>.Count;

        var aVectors = MemoryMarshal.Cast<byte, Vector<byte>>(a[..vectorChunksBound]);
        var bVectors = MemoryMarshal.Cast<byte, Vector<byte>>(b[..vectorChunksBound]);
        var resultVectors = MemoryMarshal.Cast<byte, Vector<byte>>(result.AsSpan()[..vectorChunksBound]);

        for (var i = 0; i < aVectors.Length; ++i)
        {
            resultVectors[i] = aVectors[i] ^ bVectors[i];
        }

        for (var i = vectorChunksBound; i < b.Length; ++i)
        {
            result[i] = (byte)(a[i] ^ b[i]);
        }

        return result;
    }
}
