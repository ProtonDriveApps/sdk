using System.Buffers;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using CommunityToolkit.HighPerformance.Buffers;

namespace Proton.Sdk;
internal static class MemoryProvider
{
    private const int MaxStackBufferSize = 256;

    public static bool GetHeapMemoryIfTooLargeForStack<T>(int size, [MaybeNullWhen(false)] out IMemoryOwner<T> heapMemoryOwner)
        where T : struct
    {
        if ((size * Unsafe.SizeOf<T>()) <= MaxStackBufferSize)
        {
            heapMemoryOwner = null;
            return false;
        }

        heapMemoryOwner = MemoryOwner<T>.Allocate(size);
        return true;
    }
}
