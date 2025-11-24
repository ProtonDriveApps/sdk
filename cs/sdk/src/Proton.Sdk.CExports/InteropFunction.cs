using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

/// <summary>
/// Represents a function pointer that can be called from C# to Swift/other languages.
/// Similar to InteropAction but with a return value.
/// </summary>
[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropFunction<TArg1, TArg2, TResult>
    where TArg1 : unmanaged
    where TArg2 : unmanaged
    where TResult : unmanaged
{
    private readonly delegate* unmanaged[Cdecl]<TArg1, TArg2, TResult> _pointer;

    public InteropFunction(delegate* unmanaged[Cdecl]<TArg1, TArg2, TResult> pointer)
    {
        ArgumentNullException.ThrowIfNull(pointer);
        _pointer = pointer;
    }

    public InteropFunction(long pointer)
        : this((delegate* unmanaged[Cdecl]<TArg1, TArg2, TResult>)pointer)
    {
    }

    public TResult Invoke(TArg1 arg1, TArg2 arg2)
    {
        return _pointer(arg1, arg2);
    }

    public override string ToString()
    {
        return $"0x{new nint(_pointer):x16}";
    }
}
