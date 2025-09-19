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

    public static InteropArray<T> FromMemory(ReadOnlyMemory<T> memory)
    {
        if (memory.Length == 0)
        {
            return Null;
        }

        var interopBytes = NativeMemory.Alloc((nuint)memory.Length);

        memory.Span.CopyTo(new Span<T>(interopBytes, memory.Length));

        return new InteropArray<T>((T*)interopBytes, memory.Length);
    }

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
