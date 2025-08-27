using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropVoidCallback(delegate* unmanaged[Cdecl]<void*, void> invoke)
{
    public readonly delegate* unmanaged[Cdecl]<void*, void> Invoke = invoke;
}
