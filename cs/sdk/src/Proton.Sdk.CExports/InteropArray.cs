using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropArray(byte* bytes, nint length)
{
    private readonly byte* _bytes = bytes;
    private readonly nint _length = length;

    public static InteropArray Null => default;

    public bool IsNullOrEmpty => _bytes is null || _length == 0;

    public static InteropArray FromMemory(ReadOnlyMemory<byte> memory)
    {
        if (memory.Length == 0)
        {
            return Null;
        }

        var interopBytes = NativeMemory.Alloc((nuint)memory.Length);

        memory.Span.CopyTo(new Span<byte>(interopBytes, memory.Length));

        return new InteropArray((byte*)interopBytes, memory.Length);
    }

    public byte[] ToArray()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<byte>(_bytes, (int)_length).ToArray() : [];
    }

    public byte[]? ToArrayOrNull()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<byte>(_bytes, (int)_length).ToArray() : null;
    }

    public ReadOnlySpan<byte> AsReadOnlySpan()
    {
        return !IsNullOrEmpty ? new ReadOnlySpan<byte>(_bytes, (int)_length) : null;
    }

    public void Free()
    {
        NativeMemory.Free(_bytes);
    }
}
