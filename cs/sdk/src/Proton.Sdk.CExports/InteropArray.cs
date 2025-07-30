using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropArray<T>(T* pointer, nint length)
    where T : unmanaged
{
    private readonly void* _pointer = pointer;
    private readonly nint _length = length;

    public static InteropArray<T> Null => default;

    public bool IsNullOrEmpty => _pointer is null || _length == 0;

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

    public byte[] ToArray()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<byte>(_pointer, (int)_length).ToArray() : [];
    }

    public byte[]? ToArrayOrNull()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<byte>(_pointer, (int)_length).ToArray() : null;
    }

    public ReadOnlySpan<byte> AsReadOnlySpan()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<byte>(_pointer, (int)_length) : null;
    }

    public void Free()
    {
        NativeMemory.Free(_pointer);
    }
}
