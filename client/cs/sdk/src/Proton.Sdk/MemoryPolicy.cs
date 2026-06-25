using System.Buffers;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using CommunityToolkit.HighPerformance.Buffers;

namespace Proton.Sdk;

public static class MemoryPolicy
{
    private const int MaxStackBufferSize = 256;

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static bool IsTooLargeForStack<T>(int size)
        where T : struct
    {
        return (size * Unsafe.SizeOf<T>()) > MaxStackBufferSize;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static bool GetRentedHeapMemoryIfTooLargeForStack<T>(int size, [MaybeNullWhen(false)] out IMemoryOwner<T> heapMemoryOwner)
        where T : struct
    {
        if (!IsTooLargeForStack<T>(size))
        {
            heapMemoryOwner = null;
            return false;
        }

        heapMemoryOwner = MemoryOwner<T>.Allocate(size);
        return true;
    }
}
