using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropArray<T>(T* pointer, nint length)
    where T : unmanaged
{
    public readonly T* Pointer = pointer;
    public readonly nint Length = length;

    public static InteropArray<T> Null => default;

    public bool IsNullOrEmpty => Pointer is null || Length == 0;

    public T[] ToArray()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<T>(Pointer, (int)Length).ToArray() : [];
    }

    public T[]? ToArrayOrNull()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<T>(Pointer, (int)Length).ToArray() : null;
    }

    public Span<T> AsSpan()
    {
        return !IsNullOrEmpty ? new Span<T>(Pointer, (int)Length) : null;
    }

    public ReadOnlySpan<T> AsReadOnlySpan()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<T>(Pointer, (int)Length) : null;
    }

    public void Free()
    {
        NativeMemory.Free(Pointer);
    }
}
