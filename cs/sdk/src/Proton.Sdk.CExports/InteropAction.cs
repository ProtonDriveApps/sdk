using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAction<T>
    where T : unmanaged
{
    private readonly delegate* unmanaged[Cdecl]<T, void> _pointer;

    public InteropAction(delegate* unmanaged[Cdecl]<T, void> pointer)
    {
        ArgumentNullException.ThrowIfNull(pointer);
        _pointer = pointer;
    }

    public InteropAction(long pointer)
        : this((delegate* unmanaged[Cdecl]<T, void>)pointer)
    {
    }

    public void Invoke(T arg)
    {
        _pointer(arg);
    }

    public override string ToString()
    {
        return $"0x{new nint(_pointer):x16}";
    }
}

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAction<T1, T2>
    where T1 : unmanaged
    where T2 : unmanaged
{
    private readonly delegate* unmanaged[Cdecl]<T1, T2, void> _pointer;

    public InteropAction(delegate* unmanaged[Cdecl]<T1, T2, void> pointer)
    {
        ArgumentNullException.ThrowIfNull(pointer);
        _pointer = pointer;
    }

    public InteropAction(long pointer)
        : this((delegate* unmanaged[Cdecl]<T1, T2, void>)pointer)
    {
    }

    public void Invoke(T1 arg1, T2 arg2)
    {
        _pointer(arg1, arg2);
    }

    public override string ToString()
    {
        return $"0x{new nint(_pointer):x16}";
    }
}

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAction<T1, T2, T3>
    where T1 : unmanaged
    where T2 : unmanaged
    where T3 : unmanaged
{
    private readonly delegate* unmanaged[Cdecl]<T1, T2, T3, void> _pointer;

    public InteropAction(delegate* unmanaged[Cdecl]<T1, T2, T3, void> pointer)
    {
        ArgumentNullException.ThrowIfNull(pointer);
        _pointer = pointer;
    }

    public InteropAction(long pointer)
        : this((delegate* unmanaged[Cdecl]<T1, T2, T3, void>)pointer)
    {
    }

    public void Invoke(T1 arg1, T2 arg2, T3 arg3)
    {
        _pointer(arg1, arg2, arg3);
    }

    public override string ToString()
    {
        return $"0x{new nint(_pointer):x16}";
    }
}
