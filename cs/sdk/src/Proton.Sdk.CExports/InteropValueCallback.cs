using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropValueCallback<TValue>(delegate* unmanaged[Cdecl]<nint, TValue, void> invoke)
    where TValue : unmanaged
{
    public readonly delegate* unmanaged[Cdecl]<nint, TValue, void> Invoke = invoke;
}
