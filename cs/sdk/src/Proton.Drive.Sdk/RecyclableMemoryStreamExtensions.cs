using System.Buffers;
using Microsoft.IO;

namespace Proton.Sdk.Drive;

public static class RecyclableMemoryStreamExtensions
{
    public static ReadOnlyMemory<byte> GetFirstBytes(this RecyclableMemoryStream stream, long maxLength)
    {
        var sequence = stream.GetReadOnlySequence();

        return sequence.First.Length >= maxLength
            ? sequence.First
            : sequence.Slice(0, Math.Min(maxLength, sequence.Length)).ToArray();
    }
}
